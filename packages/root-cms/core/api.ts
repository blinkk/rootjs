import {promises as fs} from 'node:fs';
import path from 'node:path';
import {Server, Request, Response} from '@blinkk/root';
import {multipartMiddleware} from '@blinkk/root/middleware';
import {
  ChatPrompt,
  AiResponse,
  SendPromptOptions,
} from '../shared/ai/prompts.js';
import {ChatClient, RootAiModel, summarizeDiff} from './ai.js';
import {RootCMSClient, parseDocId, unmarshalData} from './client.js';
import {runCronJobs} from './cron.js';
import {arrayToCsv, csvToArray} from './csv.js';

type AppModule = typeof import('./app.js');

function testValidCollectionId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id);
}

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

export interface ChatApiRequest {
  chatId: string;
  prompt: ChatPrompt | ChatPrompt[];
  model?: RootAiModel;
  options?: SendPromptOptions;
}

export interface ChatApiResponse {
  success: boolean;
  chatId: string;
  response: AiResponse;
  error?: string;
}

export interface ApiOptions {
  getRenderer: (req: Request) => Promise<AppModule>;
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
      await runCronJobs(req.rootConfig!);
      res.status(200).json({success: true});
    } catch (err) {
      console.error(err);
      res.status(500).json({success: false});
    }
  });

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
    }

    const reqBody = req.body || {};
    const dataSourceId = reqBody.id;
    if (!dataSourceId) {
      res.status(400).json({success: false, error: 'MISSING_ID'});
      return;
    }
    const cmsClient = new RootCMSClient(req.rootConfig!);
    try {
      await cmsClient.syncDataSource(dataSourceId, {syncedBy: req.user!.email});
      res.status(200).json({success: true, id: dataSourceId});
    } catch (err) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: 'UNKNOWN'});
    }
  });

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
    }

    const reqBody = req.body || {};
    const action = reqBody.action;
    if (!action) {
      res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELD',
        field: 'action',
      });
    }
    const metadata = reqBody.metadata || {};

    const cmsClient = new RootCMSClient(req.rootConfig!);
    try {
      await cmsClient.logAction(action, {
        by: req.user?.email,
        metadata: metadata,
        links: reqBody.links,
      });
      res.status(200).json({success: true});
    } catch (err) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: 'UNKNOWN'});
    }
  });

  /**
   * AI chatbot.
   */
  server.use('/cms/api/ai.chat', async (req: Request, res: Response) => {
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
    const reqBody: ChatApiRequest = req.body || {};
    if (!reqBody.prompt) {
      res.status(400).json({success: false, error: 'MISSING_PROMPT'});
      return;
    }
    const prompt = reqBody.prompt;

    try {
      const cmsClient = new RootCMSClient(req.rootConfig!);
      const chatClient = new ChatClient(cmsClient, req.user.email);
      const chat = await chatClient.getOrCreateChat(reqBody.chatId);
      const apiResponse: ChatApiResponse = {
        success: true,
        chatId: chat.id,
        response: await chat.sendPrompt(prompt, {
          mode: reqBody.options?.mode || 'chat',
          editData: reqBody.options?.editData,
        }),
      };
      res.status(200).json(apiResponse);
    } catch (err) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: 'UNKNOWN'});
    }
  });

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
      const summary = await summarizeDiff(cmsClient, {
        before: diffPayload.before,
        after: diffPayload.after,
      });
      res.status(200).json({success: true, summary});
    } catch (err: any) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: 'UNKNOWN'});
    }
  });

  server.use('/cms/api/ai.list_chats', async (req: Request, res: Response) => {
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
    const limit = reqBody.limit;

    try {
      const cmsClient = new RootCMSClient(req.rootConfig!);
      const chatClient = new ChatClient(cmsClient, req.user.email);
      const chats = await chatClient.listChats({limit});
      res.status(200).json({success: true, chats});
    } catch (err) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: 'UNKNOWN'});
    }
  });

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
        const cmsClient = new RootCMSClient(req.rootConfig!);
        const {generateImage} = await import('./ai.js');
        const imageUrl = await generateImage(cmsClient, {
          prompt,
          aspectRatio,
        });
        res.status(200).json({success: true, image: imageUrl});
      } catch (err: any) {
        console.error(err.stack || err);
        res.status(500).json({success: false, error: err.message || 'UNKNOWN'});
      }
    }
  );

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
      const cmsClient = new RootCMSClient(req.rootConfig!);
      const {translateString} = await import('./ai.js');
      const translations = await translateString(cmsClient, {
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
}
