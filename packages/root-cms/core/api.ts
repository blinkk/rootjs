import {promises as fs} from 'node:fs';
import path from 'node:path';
import {Server, Request, Response} from '@blinkk/root';
import {multipartMiddleware} from '@blinkk/root/middleware';
import {toTranslationLanguages} from '../shared/translation-languages.js';
import {
  buildChatSystemPrompt,
  buildEditSystemPrompt,
  findModel,
  generateAltText,
  generateImage,
  generatePublishMessage,
  getAiConfig,
  normalizeExecutionMode,
  serializeAiClientModel,
  serializeAiConfig,
  summarizeDiff,
  translateString,
} from './ai.js';
import {type CMSCheck} from './checks.js';
import {RootCMSClient, parseDocId, unmarshalData} from './client.js';
import {runCronJobs} from './cron.js';
import {arrayToCsv, csvToArray} from './csv.js';
import {
  DependencyGraphService,
  DependencyGraphRebuildResult,
} from './dependency-graph.js';
import {SearchIndexService, RebuildResult} from './search-index.js';
import {type CMSTranslationService} from './translations.js';
import {assertPublicHttpUrl, UnsafeUrlError} from './url-safety.js';

type AppModule = typeof import('./app.js');

function testValidCollectionId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id);
}

/**
 * Download hosts the asset sync relay (`assets.sync_proxy`) is allowed to
 * fetch from. Only known sync-provider download hosts belong here -- the
 * relay must never become a general-purpose proxy.
 */
const SYNC_PROXY_ALLOWED_HOSTS: RegExp[] = [
  // Figma image render/export buckets, e.g.
  // `figma-alpha-api.s3.us-west-2.amazonaws.com`.
  /^figma-[a-z0-9-]+\.s3([.-][a-z0-9-]+)*\.amazonaws\.com$/,
  // Figma-owned download hosts, e.g. `s3-alpha.figma.com`.
  /(^|\.)figma\.com$/,
];

/** Max response size the asset sync relay will forward (100MB). */
const SYNC_PROXY_MAX_BYTES = 100 * 1024 * 1024;

type DocVersion = 'draft' | 'published';

interface BuildDocDiffOptions {
  beforeVersion: DocVersion;
  afterVersion: DocVersion;
}

interface DocDiffPayload {
  before: Record<string, any> | null;
  after: Record<string, any> | null;
}

async function buildDocDiffPayload(
  cmsClient: RootCMSClient,
  docId: string,
  options: BuildDocDiffOptions
): Promise<DocDiffPayload> {
  const [before, after] = await Promise.all([
    readDocVersionFields(cmsClient, docId, options.beforeVersion),
    readDocVersionFields(cmsClient, docId, options.afterVersion),
  ]);
  return {before, after};
}

async function readDocVersionFields(
  cmsClient: RootCMSClient,
  docId: string,
  version: DocVersion
): Promise<Record<string, any> | null> {
  const {collection, slug} = parseDocId(docId);
  const doc = await cmsClient.getRawDoc(collection, slug, {mode: version});
  if (!doc) {
    return null;
  }
  const fields = unmarshalData(doc.fields || {});
  return removeArrayKeys(fields);
}

function removeArrayKeys(data: any): any {
  if (Array.isArray(data)) {
    return data.map((item) => removeArrayKeys(item));
  }
  if (isRecord(data)) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (key === '_arrayKey') {
        continue;
      }
      result[key] = removeArrayKeys(value);
    }
    return result;
  }
  return data;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

function isDocVersion(value: unknown): value is DocVersion {
  return value === 'draft' || value === 'published';
}

export interface ApiOptions {
  getRenderer: (req: Request) => Promise<AppModule>;
  /** Checks registered via the CMS plugin config. */
  checks?: CMSCheck[];
  /**
   * Translation services registered via the CMS plugin config.
   *
   * NOTE: The translations feature is considered a "beta" feature, its interface
   * may change from version to version as we add new features.
   */
  translations?: CMSTranslationService[];
}

/**
 * Registers API middleware handlers.
 */
export function api(server: Server, options: ApiOptions) {
  /**
   * Reads the collection's schema defined in `/collections/<id>.schema.ts`.
   */
  async function getCollectionSchema(req: Request, collectionId: string) {
    // On dev, read the collection's `schema.ts` file directly.
    if (req.viteServer) {
      const app = await options.getRenderer(req);
      return await app.getCollection(collectionId);
    }
    // On prod, read the collection's schema from
    // `dist/collections/<id>.schema.json`. This file is built in the
    // `preBuild()` hook within `plugin.ts`.
    try {
      const schemaPath = path.join(
        req.rootConfig!.rootDir,
        'dist',
        'collections',
        `${collectionId}.schema.json`
      );
      const contents = await fs.readFile(schemaPath, 'utf8');
      return JSON.parse(contents);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Returns the schema for a collection.
   *
   * Example:
   *
   * ```
   * POST /cms/api/collection.get
   * {"name": "BlogPosts"}
   * ```
   *
   * =>
   *
   * ```
   * {
   *   "success": true,
   *   "data": {"name": "BlogPosts", "description": "...", "fields": [...]}
   * }
   * ```
   */
  server.use('/cms/api/collection.get', async (req: Request, res: Response) => {
    if (
      req.method !== 'POST' ||
      !String(req.get('content-type')).startsWith('application/json')
    ) {
      res.status(400).json({success: false, error: 'BAD_REQUEST'});
      return;
    }

    const reqBody = req.body || {};
    const collectionId = String(reqBody.collectionId || '');
    if (!collectionId) {
      res.status(400).json({success: false, error: 'MISSING_COLLECTION_ID'});
      return;
    }
    if (!testValidCollectionId(collectionId)) {
      res.status(400).json({success: false, error: 'INVALID_COLLECTION_ID'});
      return;
    }

    try {
      const collection = await getCollectionSchema(req, collectionId);
      if (!collection) {
        res.status(404).json({success: false, error: 'NOT_FOUND'});
        return;
      }
      res.status(200).json({success: true, data: collection});
    } catch (err: any) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: 'UNKNOWN'});
    }
  });

  /**
   * Runs CMS cron jobs.
   */
  server.use('/cms/api/cron.run', async (req: Request, res: Response) => {
    try {
      await runCronJobs(req.rootConfig!, {
        loadSchema: (collectionId) => getCollectionSchema(req, collectionId),
      });
      res.status(200).json({success: true});
    } catch (err) {
      console.error(err);
      res.status(500).json({success: false});
    }
  });

  // Tracks in-flight search index rebuilds, keyed by projectId. Only one
  // rebuild per project may run at a time.
  const searchRebuildJobs = new Map<string, Promise<RebuildResult>>();

  /**
   * Runs a full-text search query against the persisted index.
   *
   * Authentication: any signed-in CMS user (any role) — `loginRequired`
   * already gates `/cms/...` paths in plugin.ts.
   *
   * Sample request:
   *
   * ```
   * POST /cms/api/search.query
   * {"q": "homepage hero", "limit": 25}
   * ```
   */
  server.use('/cms/api/search.query', async (req: Request, res: Response) => {
    if (
      req.method !== 'POST' ||
      !String(req.get('content-type')).startsWith('application/json')
    ) {
      res.status(400).json({success: false, error: 'BAD_REQUEST'});
      return;
    }
    if (!req.user?.email) {
      res.status(401).json({success: false, error: 'UNAUTHORIZED'});
      return;
    }
    const body = req.body || {};
    const q = typeof body.q === 'string' ? body.q : '';
    const limit = typeof body.limit === 'number' ? body.limit : 25;
    try {
      const service = new SearchIndexService(req.rootConfig!);
      const result = await service.search(q, {limit});
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({success: true, ...result});
    } catch (err) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: 'UNKNOWN'});
    }
  });

  /**
   * Returns the search index's current status (last run, doc count, etc).
   * Authentication: any signed-in CMS user.
   */
  server.use('/cms/api/search.status', async (req: Request, res: Response) => {
    if (!req.user?.email) {
      res.status(401).json({success: false, error: 'UNAUTHORIZED'});
      return;
    }
    try {
      const cmsClient = new RootCMSClient(req.rootConfig!);
      const service = new SearchIndexService(req.rootConfig!);
      const status = await service.getStatus();
      const running = searchRebuildJobs.has(cmsClient.projectId);
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({success: true, status, running});
    } catch (err) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: 'UNKNOWN'});
    }
  });

  /**
   * Triggers a rebuild of the search index. ADMIN-only.
   *
   * Sample request:
   *
   * ```
   * POST /cms/api/search.rebuild
   * {"force": true}
   * ```
   */
  server.use('/cms/api/search.rebuild', async (req: Request, res: Response) => {
    if (req.method !== 'POST') {
      res.status(400).json({success: false, error: 'BAD_REQUEST'});
      return;
    }
    if (!req.user?.email) {
      res.status(401).json({success: false, error: 'UNAUTHORIZED'});
      return;
    }
    const cmsClient = new RootCMSClient(req.rootConfig!);
    try {
      const role = await cmsClient.getUserRole(req.user.email);
      if (role !== 'ADMIN') {
        res.status(403).json({success: false, error: 'FORBIDDEN'});
        return;
      }
    } catch (err) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: 'UNKNOWN'});
      return;
    }

    const body = req.body || {};
    const force = !!body.force;
    const projectId = cmsClient.projectId;
    if (searchRebuildJobs.has(projectId)) {
      res.status(202).json({success: true, alreadyRunning: true});
      return;
    }
    // Delegate schema loading to the same path used by `/cms/api/collection.get`
    // so that dev (Vite SSR) and prod (dist JSON) both work transparently.
    const service = new SearchIndexService(req.rootConfig!, (collectionId) =>
      getCollectionSchema(req, collectionId)
    );
    const job = service
      .rebuildIndex({force})
      .catch((err) => {
        console.error('search.rebuild failed:', err.stack || err);
        throw err;
      })
      .finally(() => {
        searchRebuildJobs.delete(projectId);
      });
    searchRebuildJobs.set(projectId, job);
    res.status(202).json({success: true, started: true, force});
  });

  // Tracks in-flight dependency graph rebuilds, keyed by projectId. Only one
  // rebuild per project may run at a time.
  const dependencyGraphRebuildJobs = new Map<
    string,
    Promise<DependencyGraphRebuildResult>
  >();

  /**
   * Queries the dependency graph for the docs referenced by one or more docs.
   * Requires the `dependencyGraph` cmsPlugin option to be enabled.
   *
   * Authentication: any signed-in CMS user.
   *
   * Sample request:
   *
   * ```
   * POST /cms/api/dependency_graph.query
   * {"docIds": ["Pages/index"], "mode": "draft", "transitive": true}
   * ```
   */
  server.use(
    '/cms/api/dependency_graph.query',
    async (req: Request, res: Response) => {
      if (
        req.method !== 'POST' ||
        !String(req.get('content-type')).startsWith('application/json')
      ) {
        res.status(400).json({success: false, error: 'BAD_REQUEST'});
        return;
      }
      if (!req.user?.email) {
        res.status(401).json({success: false, error: 'UNAUTHORIZED'});
        return;
      }
      const body = req.body || {};
      const docIds = Array.isArray(body.docIds)
        ? body.docIds.filter((id: any) => typeof id === 'string')
        : [];
      if (docIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_FIELD',
          field: 'docIds',
        });
        return;
      }
      const mode = body.mode === 'published' ? 'published' : 'draft';
      const transitive = body.transitive !== false;
      try {
        const service = new DependencyGraphService(req.rootConfig!);
        if (!service.isEnabled()) {
          res.status(404).json({success: false, error: 'NOT_ENABLED'});
          return;
        }
        const graph = await service.getGraph(mode);
        const deps = graph.getDependencies(docIds, {transitive});
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json({
          success: true,
          mode,
          deps,
          lastRun: graph.lastRun,
        });
      } catch (err) {
        console.error(err.stack || err);
        res.status(500).json({success: false, error: 'UNKNOWN'});
      }
    }
  );

  /**
   * Returns the dependency graph's current status (last run, ref counts).
   * Authentication: any signed-in CMS user.
   */
  server.use(
    '/cms/api/dependency_graph.status',
    async (req: Request, res: Response) => {
      if (!req.user?.email) {
        res.status(401).json({success: false, error: 'UNAUTHORIZED'});
        return;
      }
      try {
        const cmsClient = new RootCMSClient(req.rootConfig!);
        const service = new DependencyGraphService(req.rootConfig!);
        const status = await service.getStatus();
        const running = dependencyGraphRebuildJobs.has(cmsClient.projectId);
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json({success: true, status, running});
      } catch (err) {
        console.error(err.stack || err);
        res.status(500).json({success: false, error: 'UNKNOWN'});
      }
    }
  );

  /**
   * Triggers a rebuild of the dependency graph. ADMIN-only.
   *
   * Sample request:
   *
   * ```
   * POST /cms/api/dependency_graph.rebuild
   * {"force": true}
   * ```
   */
  server.use(
    '/cms/api/dependency_graph.rebuild',
    async (req: Request, res: Response) => {
      if (req.method !== 'POST') {
        res.status(400).json({success: false, error: 'BAD_REQUEST'});
        return;
      }
      if (!req.user?.email) {
        res.status(401).json({success: false, error: 'UNAUTHORIZED'});
        return;
      }
      const cmsClient = new RootCMSClient(req.rootConfig!);
      try {
        const role = await cmsClient.getUserRole(req.user.email);
        if (role !== 'ADMIN') {
          res.status(403).json({success: false, error: 'FORBIDDEN'});
          return;
        }
      } catch (err) {
        console.error(err.stack || err);
        res.status(500).json({success: false, error: 'UNKNOWN'});
        return;
      }

      const service = new DependencyGraphService(req.rootConfig!);
      if (!service.isEnabled()) {
        res.status(404).json({success: false, error: 'NOT_ENABLED'});
        return;
      }
      const body = req.body || {};
      const force = !!body.force;
      const projectId = cmsClient.projectId;
      if (dependencyGraphRebuildJobs.has(projectId)) {
        res.status(202).json({success: true, alreadyRunning: true});
        return;
      }
      const job = service
        .rebuildGraph({force})
        .catch((err) => {
          console.error('dependency_graph.rebuild failed:', err.stack || err);
          throw err;
        })
        .finally(() => {
          dependencyGraphRebuildJobs.delete(projectId);
        });
      dependencyGraphRebuildJobs.set(projectId, job);
      res.status(202).json({success: true, started: true, force});
    }
  );

  /**
   * Syncs the published-mode dependency graph edges for specific docs by
   * re-reading them from the `Published` collection (missing docs have their
   * edges removed). The CMS UI calls this after publishing, unpublishing, or
   * deleting docs client-side, so the graph reflects new references
   * immediately instead of waiting for the next cron tick. Idempotent — the
   * graph is synced to whatever is currently in the database.
   *
   * Authentication: any signed-in CMS user.
   *
   * Sample request:
   *
   * ```
   * POST /cms/api/dependency_graph.sync_published
   * {"docIds": ["Pages/index"]}
   * ```
   */
  server.use(
    '/cms/api/dependency_graph.sync_published',
    async (req: Request, res: Response) => {
      if (
        req.method !== 'POST' ||
        !String(req.get('content-type')).startsWith('application/json')
      ) {
        res.status(400).json({success: false, error: 'BAD_REQUEST'});
        return;
      }
      if (!req.user?.email) {
        res.status(401).json({success: false, error: 'UNAUTHORIZED'});
        return;
      }
      const body = req.body || {};
      const docIds = Array.isArray(body.docIds)
        ? body.docIds.filter((id: any) => typeof id === 'string')
        : [];
      if (docIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_FIELD',
          field: 'docIds',
        });
        return;
      }
      if (docIds.length > 1000) {
        res.status(400).json({success: false, error: 'TOO_MANY_DOC_IDS'});
        return;
      }
      try {
        const service = new DependencyGraphService(req.rootConfig!);
        if (!service.isEnabled()) {
          res.status(404).json({success: false, error: 'NOT_ENABLED'});
          return;
        }
        const result = await service.syncPublishedDocs(docIds);
        res.status(200).json({success: true, ...result});
      } catch (err) {
        console.error(err.stack || err);
        res.status(500).json({success: false, error: 'UNKNOWN'});
      }
    }
  );

  /**
   * Accepts a JSON object containing {headers: [...], rows: [...]} and sends
   * an HTTP response with a corresponding CSV file as an attachment.
   *
   * Sample request:
   *
   * ```json
   * {
   *   "headers": ["foo"],
   *   "rows": [
   *     {"foo": "bar"},
   *     {"foo": "baz"},
   *   ]
   * }
   * ```
   */
  server.use('/cms/api/csv.download', (req: Request, res: Response) => {
    if (
      req.method !== 'POST' ||
      !String(req.get('content-type')).startsWith('application/json')
    ) {
      res.status(400).json({success: false, error: 'BAD_REQUEST'});
      return;
    }

    try {
      const body = req.body || {};
      const headers = body.headers || [];
      const rows = body.rows || [];
      const csv = arrayToCsv({headers, rows});
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="data.csv"');
      res.status(200).end(csv);
    } catch (err) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: 'UNKNOWN'});
    }
  });

  /**
   * Imports a CSV file and returns a JSON array of objects representing the
   * CSV.
   *
   * Sample response:
   *
   * ```json
   * {
   *   "success": true,
   *   "data": [
   *     {"foo": "bar"},
   *     {"foo": "baz"},
   *   ]
   * }
   * ```
   */
  server.use(
    '/cms/api/csv.import',
    multipartMiddleware(),
    (req: Request, res: Response) => {
      if (req.method !== 'POST' || !req.files || !req.files.file) {
        res.status(400).json({success: false, error: 'BAD_REQUEST'});
        return;
      }

      try {
        const file = req.files.file;
        const csvString = file.buffer.toString('utf8');
        const rows = csvToArray(csvString);
        res.status(200).json({success: true, data: rows});
      } catch (err) {
        console.error(err.stack || err);
        res.status(500).json({success: false, error: 'UNKNOWN'});
      }
    }
  );

  /**
   * Runs a data source sync.
   */
  server.use('/cms/api/data.sync', async (req: Request, res: Response) => {
    if (
      req.method !== 'POST' ||
      !String(req.get('content-type')).startsWith('application/json')
    ) {
      res.status(400).json({success: false, error: 'BAD_REQUEST'});
      return;
    }

    if (!req.user?.email) {
      res.status(401).json({success: false, error: 'UNAUTHORIZED'});
      return;
    }

    const reqBody = req.body || {};
    const dataSourceId = reqBody.id;
    if (!dataSourceId) {
      res.status(400).json({success: false, error: 'MISSING_ID'});
      return;
    }
    const cmsClient = new RootCMSClient(req.rootConfig!);
    try {
      await cmsClient.syncDataSource(dataSourceId, {syncedBy: req.user.email});
      res.status(200).json({success: true, id: dataSourceId});
    } catch (err) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: 'UNKNOWN'});
    }
  });

  /**
   * Relays an asset download for the asset sync feature (see
   * `ui/utils/asset-sync/`), used as a fallback when the browser can't
   * fetch a provider's (pre-signed, unauthenticated) download URL directly
   * due to CORS. The relay is deliberately dumb: it only allows known
   * provider download hosts (no user-controlled hosts, preventing SSRF),
   * forwards no client headers, follows no redirects, and caps the
   * response size.
   *
   * ```
   * POST /cms/api/assets.sync_proxy
   * {"url": "https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/..."}
   * ```
   */
  server.use(
    '/cms/api/assets.sync_proxy',
    async (req: Request, res: Response) => {
      if (
        req.method !== 'POST' ||
        !String(req.get('content-type')).startsWith('application/json')
      ) {
        res.status(400).json({success: false, error: 'BAD_REQUEST'});
        return;
      }
      if (!req.user?.email) {
        res.status(401).json({success: false, error: 'UNAUTHORIZED'});
        return;
      }
      const url = req.body?.url;
      if (!url || typeof url !== 'string') {
        res.status(400).json({success: false, error: 'MISSING_URL'});
        return;
      }
      try {
        const parsed = await assertPublicHttpUrl(url);
        const hostname = parsed.hostname.toLowerCase();
        const allowed = SYNC_PROXY_ALLOWED_HOSTS.some((re) =>
          re.test(hostname)
        );
        if (!allowed) {
          res.status(400).json({success: false, error: 'HOST_NOT_ALLOWED'});
          return;
        }
        const upstream = await fetch(url, {redirect: 'error'});
        if (!upstream.ok) {
          res.status(502).json({
            success: false,
            error: 'UPSTREAM_ERROR',
            status: upstream.status,
          });
          return;
        }
        const contentLength = Number(
          upstream.headers.get('content-length') || 0
        );
        if (contentLength > SYNC_PROXY_MAX_BYTES) {
          res.status(413).json({success: false, error: 'FILE_TOO_LARGE'});
          return;
        }
        const buffer = Buffer.from(await upstream.arrayBuffer());
        if (buffer.length > SYNC_PROXY_MAX_BYTES) {
          res.status(413).json({success: false, error: 'FILE_TOO_LARGE'});
          return;
        }
        res.setHeader(
          'Content-Type',
          upstream.headers.get('content-type') || 'application/octet-stream'
        );
        res.status(200).end(buffer);
      } catch (err) {
        if (err instanceof UnsafeUrlError) {
          res.status(400).json({success: false, error: 'UNSAFE_URL'});
          return;
        }
        console.error(err.stack || err);
        res.status(502).json({success: false, error: 'DOWNLOAD_FAILED'});
      }
    }
  );

  /**
   * Logs an action.
   */
  server.use('/cms/api/actions.log', async (req: Request, res: Response) => {
    if (
      req.method !== 'POST' ||
      !String(req.get('content-type')).startsWith('application/json')
    ) {
      res.status(400).json({success: false, error: 'BAD_REQUEST'});
      return;
    }

    if (!req.user?.email) {
      res.status(401).json({success: false, error: 'UNAUTHORIZED'});
      return;
    }

    const reqBody = req.body || {};
    const action = reqBody.action;
    if (!action) {
      res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELD',
        field: 'action',
      });
      return;
    }
    const metadata = reqBody.metadata || {};

    const cmsClient = new RootCMSClient(req.rootConfig!);
    try {
      await cmsClient.logAction(action, {
        by: req.user.email,
        metadata: metadata,
        links: reqBody.links,
      });
      res.status(200).json({success: true});
    } catch (err) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: 'UNKNOWN'});
    }
  });

  // ===========================================================================
  // One-shot AI tasks. These wrap the Vercel AI SDK helpers in `ai.ts`
  // and use the `ai` config registered on the cmsPlugin.
  // ===========================================================================

  /**
   * Summarizes the changes between two doc versions.
   *
   * ```
   * POST /cms/api/ai.diff
   * {"docId": "Pages/index", "beforeVersion": "published", "afterVersion": "draft"}
   * ```
   */
  server.use('/cms/api/ai.diff', async (req: Request, res: Response) => {
    if (
      req.method !== 'POST' ||
      !String(req.get('content-type')).startsWith('application/json')
    ) {
      res.status(400).json({success: false, error: 'BAD_REQUEST'});
      return;
    }
    if (!req.user?.email) {
      res.status(401).json({success: false, error: 'UNAUTHORIZED'});
      return;
    }

    const reqBody = req.body || {};
    const docId = typeof reqBody.docId === 'string' ? reqBody.docId.trim() : '';
    if (!docId) {
      res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELD',
        field: 'docId',
      });
      return;
    }

    try {
      const cmsClient = new RootCMSClient(req.rootConfig!);
      const beforeVersion: DocVersion = isDocVersion(reqBody.beforeVersion)
        ? reqBody.beforeVersion
        : 'published';
      const afterVersion: DocVersion = isDocVersion(reqBody.afterVersion)
        ? reqBody.afterVersion
        : 'draft';
      const diffPayload = await buildDocDiffPayload(cmsClient, docId, {
        beforeVersion,
        afterVersion,
      });
      if (!diffPayload.before && !diffPayload.after) {
        res.status(200).json({success: true, summary: ''});
        return;
      }
      const summary = await summarizeDiff(req.rootConfig!, {
        before: diffPayload.before,
        after: diffPayload.after,
      });
      res.status(200).json({success: true, summary});
    } catch (err: any) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: err.message || 'UNKNOWN'});
    }
  });

  /**
   * Generates an image from a text prompt using the configured image model.
   *
   * ```
   * POST /cms/api/ai.generate_image
   * {"prompt": "A red apple", "aspectRatio": "16:9"}
   * ```
   */
  server.use(
    '/cms/api/ai.generate_image',
    async (req: Request, res: Response) => {
      if (
        req.method !== 'POST' ||
        !String(req.get('content-type')).startsWith('application/json')
      ) {
        res.status(400).json({success: false, error: 'BAD_REQUEST'});
        return;
      }
      if (!req.user?.email) {
        res.status(401).json({success: false, error: 'UNAUTHORIZED'});
        return;
      }
      const reqBody = req.body || {};
      const prompt = reqBody.prompt;
      const aspectRatio = reqBody.aspectRatio;

      if (!prompt || !aspectRatio) {
        res.status(400).json({success: false, error: 'MISSING_REQUIRED_FIELD'});
        return;
      }

      try {
        const result = await generateImage(req.rootConfig!, {
          prompt,
          aspectRatio,
        });
        res.status(200).json({success: true, image: result.imageUrl});
      } catch (err: any) {
        console.error(err.stack || err);
        res.status(500).json({success: false, error: err.message || 'UNKNOWN'});
      }
    }
  );

  /**
   * Generates a concise publish message describing changes since the last
   * publish.
   *
   * ```
   * POST /cms/api/ai.publish_message
   * {"docId": "Pages/index"}
   * ```
   */
  server.use(
    '/cms/api/ai.publish_message',
    async (req: Request, res: Response) => {
      if (
        req.method !== 'POST' ||
        !String(req.get('content-type')).startsWith('application/json')
      ) {
        res.status(400).json({success: false, error: 'BAD_REQUEST'});
        return;
      }
      if (!req.user?.email) {
        res.status(401).json({success: false, error: 'UNAUTHORIZED'});
        return;
      }

      const reqBody = req.body || {};
      const docId =
        typeof reqBody.docId === 'string' ? reqBody.docId.trim() : '';
      if (!docId) {
        res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_FIELD',
          field: 'docId',
        });
        return;
      }

      try {
        const cmsClient = new RootCMSClient(req.rootConfig!);
        const diffPayload = await buildDocDiffPayload(cmsClient, docId, {
          beforeVersion: 'published',
          afterVersion: 'draft',
        });
        if (!diffPayload.before && !diffPayload.after) {
          res.status(200).json({success: true, message: 'Initial version'});
          return;
        }
        const message = await generatePublishMessage(req.rootConfig!, {
          before: diffPayload.before,
          after: diffPayload.after,
        });
        res.status(200).json({success: true, message});
      } catch (err: any) {
        console.error(err.stack || err);
        res.status(500).json({success: false, error: err.message || 'UNKNOWN'});
      }
    }
  );

  /**
   * Generates alt text for an image given its URL.
   *
   * ```
   * POST /cms/api/ai.generate_alt_text
   * {"imageUrl": "https://..."}
   * ```
   */
  server.use(
    '/cms/api/ai.generate_alt_text',
    async (req: Request, res: Response) => {
      if (
        req.method !== 'POST' ||
        !String(req.get('content-type')).startsWith('application/json')
      ) {
        res.status(400).json({success: false, error: 'BAD_REQUEST'});
        return;
      }
      if (!req.user?.email) {
        res.status(401).json({success: false, error: 'UNAUTHORIZED'});
        return;
      }
      const reqBody = req.body || {};
      const imageUrl =
        typeof reqBody.imageUrl === 'string' ? reqBody.imageUrl.trim() : '';
      if (!imageUrl) {
        res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_FIELD',
          field: 'imageUrl',
        });
        return;
      }
      // Validate against SSRF: the Vercel AI SDK may fetch URL-typed images
      // server-side before forwarding to the provider, so an attacker-supplied
      // URL pointed at a private/metadata address would be fetched from the
      // CMS host's network.
      try {
        await assertPublicHttpUrl(imageUrl);
      } catch (err) {
        if (err instanceof UnsafeUrlError) {
          res.status(400).json({success: false, error: 'INVALID_IMAGE_URL'});
          return;
        }
        throw err;
      }
      try {
        const altText = await generateAltText(req.rootConfig!, {imageUrl});
        res.status(200).json({success: true, altText});
      } catch (err: any) {
        console.error(err.stack || err);
        res.status(500).json({success: false, error: err.message || 'UNKNOWN'});
      }
    }
  );

  // ===========================================================================
  // /cms/api/ai.* — Vercel AI SDK powered chat for /cms/ai.
  // ===========================================================================

  /**
   * Returns the available models (without API keys) for the model picker,
   * plus the signed-in user's role so the UI can gate the auto-apply mode.
   */
  server.use('/cms/api/ai.config', async (req: Request, res: Response) => {
    if (!req.user?.email) {
      res.status(401).json({success: false, error: 'UNAUTHORIZED'});
      return;
    }
    const aiConfig = getAiConfig(req.rootConfig!);
    if (!aiConfig) {
      res.status(200).json({success: true, enabled: false});
      return;
    }
    const cmsClient = new RootCMSClient(req.rootConfig!);
    const role = await cmsClient.getUserRole(req.user.email).catch(() => null);
    res.status(200).json({
      success: true,
      enabled: true,
      ...serializeAiConfig(aiConfig),
      role: role || null,
      canAutoApply: role === 'ADMIN' || role === 'EDITOR',
    });
  });

  /**
   * Prepares a client-side chat turn. The browser streams the model response
   * directly from the provider (SSE proxying did not work on App Engine /
   * Firebase Hosting), so this non-streaming endpoint just hands back what the
   * client needs: the assembled system prompt (including `ROOT.md`), the
   * selected model's connection config (WITH the API key — direct
   * browser-to-provider calls require it), and tool-loop limits.
   *
   * Chat history is created and persisted to Firestore directly from the
   * browser, so this endpoint is stateless.
   */
  server.use('/cms/api/ai.chat.prepare', async (req: Request, res: Response) => {
    if (req.method !== 'POST') {
      res.status(400).json({success: false, error: 'BAD_REQUEST'});
      return;
    }
    if (!req.user?.email) {
      res.status(401).json({success: false, error: 'UNAUTHORIZED'});
      return;
    }
    const aiConfig = getAiConfig(req.rootConfig!);
    if (!aiConfig) {
      res.status(404).json({success: false, error: 'AI_NOT_CONFIGURED'});
      return;
    }

    const body = req.body || {};
    const model = findModel(aiConfig, body.modelId);
    if (!model) {
      res.status(400).json({success: false, error: 'UNKNOWN_MODEL'});
      return;
    }
    const requestedMode = normalizeExecutionMode(body.executionMode);
    const activeDocId =
      typeof body.docId === 'string' && body.docId.trim()
        ? body.docId.trim()
        : undefined;

    // Require the user to have an assigned role on this project. Write tools
    // dispatched by the model are gated by Firestore rules, but we still deny
    // AI access to ACL'd users with no role and restrict auto-apply to
    // publishers. Auto requested by a non-publisher is downgraded to "approve"
    // so the system prompt and the client approval flow stay in sync.
    let canAutoApply = false;
    try {
      const cmsClient = new RootCMSClient(req.rootConfig!);
      const role = await cmsClient.getUserRole(req.user.email);
      if (!role) {
        res.status(403).json({success: false, error: 'FORBIDDEN'});
        return;
      }
      canAutoApply = role === 'ADMIN' || role === 'EDITOR';
    } catch (err) {
      console.error('failed to resolve user role:', err);
      res.status(500).json({success: false, error: 'UNKNOWN'});
      return;
    }
    const executionMode =
      requestedMode === 'auto' && !canAutoApply ? 'approve' : requestedMode;

    try {
      const system = await buildChatSystemPrompt({
        rootConfig: req.rootConfig!,
        config: aiConfig,
        executionMode,
        activeDocId,
      });
      res.status(200).json({
        success: true,
        model: serializeAiClientModel(model),
        system,
        executionMode,
        canAutoApply,
        maxSteps: aiConfig.maxSteps ?? 10,
      });
    } catch (err: any) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: err.message || 'UNKNOWN'});
    }
  });

  /**
   * Prepares a client-side "Edit with AI" turn (array-item diff-viewer flow).
   * Like `ai.chat.prepare`, the browser streams directly from the provider.
   * Returns the read-only edit system prompt (with the project's
   * `root-cms.d.ts` types and the JSON being edited injected as untrusted
   * data) plus the selected model's connection config.
   */
  server.use('/cms/api/ai.edit.prepare', async (req: Request, res: Response) => {
    if (req.method !== 'POST') {
      res.status(400).json({success: false, error: 'BAD_REQUEST'});
      return;
    }
    if (!req.user?.email) {
      res.status(401).json({success: false, error: 'UNAUTHORIZED'});
      return;
    }
    const aiConfig = getAiConfig(req.rootConfig!);
    if (!aiConfig) {
      res.status(404).json({success: false, error: 'AI_NOT_CONFIGURED'});
      return;
    }

    const body = req.body || {};
    const model = findModel(aiConfig, body.modelId);
    if (!model) {
      res.status(400).json({success: false, error: 'UNKNOWN_MODEL'});
      return;
    }

    try {
      const cmsClient = new RootCMSClient(req.rootConfig!);
      const role = await cmsClient.getUserRole(req.user.email);
      if (!role) {
        res.status(403).json({success: false, error: 'FORBIDDEN'});
        return;
      }
    } catch (err) {
      console.error('failed to resolve user role:', err);
      res.status(500).json({success: false, error: 'UNKNOWN'});
      return;
    }

    try {
      const system = await buildEditSystemPrompt({
        rootConfig: req.rootConfig!,
        editData: body.editData,
      });
      res.status(200).json({
        success: true,
        model: serializeAiClientModel(model),
        system,
        maxSteps: aiConfig.maxSteps ?? 10,
      });
    } catch (err: any) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: err.message || 'UNKNOWN'});
    }
  });

  server.use('/cms/api/ai.translate', async (req: Request, res: Response) => {
    if (
      req.method !== 'POST' ||
      !String(req.get('content-type')).startsWith('application/json')
    ) {
      res.status(400).json({success: false, error: 'BAD_REQUEST'});
      return;
    }
    if (!req.user?.email) {
      res.status(401).json({success: false, error: 'UNAUTHORIZED'});
      return;
    }
    const reqBody = req.body || {};
    const sourceText = reqBody.sourceText;
    const targetLocales = reqBody.targetLocales;
    const description = reqBody.description;
    const existingTranslations = reqBody.existingTranslations || {};

    if (!sourceText || !targetLocales || !Array.isArray(targetLocales)) {
      res.status(400).json({success: false, error: 'MISSING_REQUIRED_FIELD'});
      return;
    }

    try {
      const translations = await translateString(req.rootConfig!, {
        sourceText,
        targetLocales,
        description,
        existingTranslations,
      });
      res.status(200).json({success: true, translations});
    } catch (err: any) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: err.message || 'UNKNOWN'});
    }
  });

  /**
   * Runs a registered check against a document.
   *
   * ```
   * POST /cms/api/check.test
   * {"check": "check-id", "docId": "Pages/index"}
   * ```
   */
  server.use('/cms/api/check.test', async (req: Request, res: Response) => {
    if (
      req.method !== 'POST' ||
      !String(req.get('content-type')).startsWith('application/json')
    ) {
      res.status(400).json({success: false, error: 'BAD_REQUEST'});
      return;
    }
    if (!req.user?.email) {
      res.status(401).json({success: false, error: 'UNAUTHORIZED'});
      return;
    }

    const reqBody = req.body || {};
    const checkId = String(reqBody.check || '');
    const docId = String(reqBody.docId || '');
    if (!checkId || !docId) {
      res.status(400).json({success: false, error: 'MISSING_REQUIRED_FIELD'});
      return;
    }

    const checks = options.checks || [];
    const check = checks.find((c) => c.id === checkId);
    if (!check) {
      res.status(404).json({success: false, error: 'CHECK_NOT_FOUND'});
      return;
    }

    const {collection: collectionId, slug} = parseDocId(docId);

    // Enforce collection restriction if configured.
    if (check.collections && !check.collections.includes(collectionId)) {
      res.status(400).json({
        success: false,
        error: 'CHECK_NOT_APPLICABLE',
      });
      return;
    }
    const cmsClient = new RootCMSClient(req.rootConfig!);

    let collectionSchema = null;
    try {
      collectionSchema = await getCollectionSchema(req, collectionId);
    } catch {
      // Schema may not be available, continue with null.
    }

    try {
      const result = await check.run({
        rootConfig: req.rootConfig!,
        cmsClient,
        docId,
        collectionId,
        slug,
        collectionSchema,
      });
      res.status(200).json({success: true, data: result});
    } catch (err: any) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: err.message || 'UNKNOWN'});
    }
  });

  /**
   * Imports translations from a registered translation service.
   *
   * ```
   * POST /cms/api/translations.import
   * {"serviceId": "crowdin", "docId": "Pages/index", "data": [...]}
   * ```
   */
  server.use(
    '/cms/api/translations.import',
    async (req: Request, res: Response) => {
      await handleTranslationServiceRequest(req, res, 'import');
    }
  );

  /**
   * Exports translations to a registered translation service.
   *
   * ```
   * POST /cms/api/translations.export
   * {"serviceId": "crowdin", "docId": "Pages/index", "data": [...]}
   * ```
   */
  server.use(
    '/cms/api/translations.export',
    async (req: Request, res: Response) => {
      await handleTranslationServiceRequest(req, res, 'export');
    }
  );

  /** Shared handler for translation service import/export endpoints. */
  async function handleTranslationServiceRequest(
    req: Request,
    res: Response,
    action: 'import' | 'export'
  ) {
    if (
      req.method !== 'POST' ||
      !String(req.get('content-type')).startsWith('application/json')
    ) {
      res.status(400).json({success: false, error: 'BAD_REQUEST'});
      return;
    }
    if (!req.user?.email) {
      res.status(401).json({success: false, error: 'UNAUTHORIZED'});
      return;
    }

    const reqBody = req.body || {};
    const serviceId = String(reqBody.serviceId || '').trim();
    const docId = String(reqBody.docId || '').trim();
    const data = Array.isArray(reqBody.data) ? reqBody.data : [];

    // Validate data rows have expected shape.
    for (const row of data) {
      if (
        typeof row?.source !== 'string' ||
        typeof row?.translations !== 'object' ||
        row.translations === null ||
        Array.isArray(row.translations)
      ) {
        res.status(400).json({success: false, error: 'INVALID_DATA_FORMAT'});
        return;
      }
      for (const value of Object.values(row.translations)) {
        if (typeof value !== 'string') {
          res.status(400).json({success: false, error: 'INVALID_DATA_FORMAT'});
          return;
        }
      }
      if (
        row.description !== undefined &&
        typeof row.description !== 'string'
      ) {
        res.status(400).json({success: false, error: 'INVALID_DATA_FORMAT'});
        return;
      }
    }

    if (!serviceId || !docId) {
      res.status(400).json({success: false, error: 'MISSING_REQUIRED_FIELD'});
      return;
    }

    const services = options.translations || [];
    const service = services.find((s) => s.id === serviceId);
    if (!service) {
      res.status(404).json({success: false, error: 'SERVICE_NOT_FOUND'});
      return;
    }

    const handler = action === 'import' ? service.onImport : service.onExport;
    if (!handler) {
      res.status(400).json({
        success: false,
        error: `SERVICE_DOES_NOT_SUPPORT_${action.toUpperCase()}`,
      });
      return;
    }

    let collectionId: string;
    let slug: string;
    try {
      const parsed = parseDocId(docId);
      collectionId = parsed.collection;
      slug = parsed.slug;
    } catch (err: any) {
      console.error(err.stack || err);
      res.status(400).json({success: false, error: 'INVALID_DOC_ID'});
      return;
    }

    try {
      const cmsClient = new RootCMSClient(req.rootConfig!);
      const i18nConfig = req.rootConfig?.i18n || {};
      const locales = i18nConfig.locales || [];
      const translationLanguages = toTranslationLanguages(i18nConfig, locales);

      const result = await handler(
        {
          rootConfig: req.rootConfig!,
          cmsClient,
          docId,
          collectionId,
          slug,
          locales,
          translationLanguages,
          user: {email: req.user!.email},
        },
        data
      );
      res.status(200).json({success: true, data: result});
    } catch (err: any) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: err.message || 'UNKNOWN'});
    }
  }
}
