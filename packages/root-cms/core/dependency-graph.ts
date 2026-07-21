/**
 * Persisted dependency graph of reference field usages between CMS docs.
 *
 * The graph tracks, for every doc in the project, the set of docs it
 * references via `schema.reference()` / `schema.references()` fields (at any
 * nesting depth, including refs inside objects, arrays, and oneof fields).
 * The primary use case is resolving the full set of docs that need to be
 * fetched when serving one or more docs, e.g.:
 *
 * ```ts
 * const cmsClient = new RootCMSClient(rootConfig);
 * const graph = await cmsClient.getDependencyGraph({mode: 'published'});
 * const depIds = graph.getDependencies(['Pages/index']);
 * // => ['Authors/alice', 'BlogPosts/hello-world', ...]
 * const req = cmsClient.createBatchRequest({mode: 'published'});
 * req.addDoc('Pages/index');
 * depIds.forEach((docId) => req.addDoc(docId));
 * const res = await req.fetch();
 * ```
 *
 * The feature is opt-in. Enable it in `root.config.ts` via the cmsPlugin
 * config, e.g. `cmsPlugin({dependencyGraph: true})`. Once enabled, the graph
 * is automatically kept up to date by the CMS cron job (`/cms/api/cron.run`),
 * which incrementally re-extracts references for docs that changed since the
 * last run.
 *
 * Extraction is data-driven (no collection schemas required): a value is
 * treated as a reference when it has the shape saved by the CMS reference
 * fields, i.e. `{id: '<collection>/<slug>', collection, slug}` with a
 * consistent id. This allows the cron to run without loading schema files and
 * catches references anywhere in the doc data.
 *
 * Persistence layout:
 *   Projects/{projectId}/DependencyGraph/_meta
 *     — {lastRun, docCounts, refDocCounts, refCounts}
 *   Projects/{projectId}/DependencyGraph/{mode}--{collectionId}
 *     — {mode, collection, refs: {[slug]: refDocIds[]}}
 *
 * Build modes:
 *   - `force: false` (cron path) — incremental: re-extract refs for docs whose
 *     `sys.modifiedAt` (draft) / `sys.publishedAt` (published) changed since
 *     the last run, and reconcile deletions by diffing tracked slugs against
 *     the live doc-id set per collection.
 *   - `force: true` — drop everything and re-extract every doc.
 */

import fs from 'node:fs';
import path from 'node:path';
import {RootConfig} from '@blinkk/root';
import {
  Firestore,
  Query,
  Timestamp,
  WriteBatch,
} from 'firebase-admin/firestore';
import glob from 'tiny-glob';
import {normalizeSlug} from '../shared/slug.js';
import {DocMode, getCmsPlugin, parseDocId} from './client.js';
import type {CMSDependencyGraphConfig} from './plugin.js';

/** Doc modes tracked by the graph. */
const MODES: DocMode[] = ['draft', 'published'];

const DEPENDENCY_GRAPH_SUBCOLLECTION = 'DependencyGraph';
const META_DOC_ID = '_meta';

/** Guard against pathological nesting when walking doc data. */
const MAX_WALK_DEPTH = 100;

/** Max ops per Firestore batch commit (hard limit is 500). */
const BATCH_MAX_OPS = 400;

interface DependencyGraphMeta {
  /** Timestamp captured at the start of the last (non-skipped) rebuild. */
  lastRun: Timestamp;
  /**
   * Live doc count per `<mode>--<collectionId>` as of `lastRun`. Used by
   * `hasChangesSince()` to cheaply detect deletions via count() aggregation
   * queries.
   */
  docCounts: Record<string, number>;
  /** Number of docs with at least one outgoing reference, per mode. */
  refDocCounts: Record<DocMode, number>;
  /** Total number of outgoing reference edges, per mode. */
  refCounts: Record<DocMode, number>;
}

/**
 * A `{mode}--{collectionId}` doc in the DependencyGraph subcollection, holding
 * the outgoing references for every doc in a single collection.
 */
interface DependencyGraphEdgeDoc {
  mode: DocMode;
  collection: string;
  /** Map of doc slug to the sorted list of doc ids it references. */
  refs: Record<string, string[]>;
}

export interface DependencyGraphModeStatus {
  /** Number of docs with at least one outgoing reference. */
  docsWithRefs: number;
  /** Total number of outgoing reference edges. */
  refs: number;
}

export interface DependencyGraphStatus {
  /** Whether the feature is enabled via the cmsPlugin config. */
  enabled: boolean;
  /** Millis timestamp of the last graph update, or `null` if never built. */
  lastRun: number | null;
  draft: DependencyGraphModeStatus;
  published: DependencyGraphModeStatus;
}

export interface DependencyGraphRebuildResult {
  /** True if a full (force) rebuild was performed. */
  forced: boolean;
  /** True if the rebuild short-circuited (no doc changes were found). */
  skipped: boolean;
  refDocCounts: Record<DocMode, number>;
  refCounts: Record<DocMode, number>;
  durationMs: number;
}

export interface GetDependenciesOptions {
  /**
   * Whether to resolve dependencies transitively (i.e. also include the
   * references of referenced docs, recursively). Defaults to `true`.
   */
  transitive?: boolean;
}

/**
 * Normalized dependency graph filters. Empty arrays are treated as "unset" so
 * a defensively-passed empty list doesn't accidentally exclude everything.
 */
interface ResolvedFilters {
  includeCollections: Set<string> | null;
  excludeCollections: Set<string> | null;
}

/**
 * Normalizes the `dependencyGraph` cmsPlugin option. Returns the config
 * object when the feature is enabled, or `null` when disabled.
 */
export function resolveDependencyGraphConfig(
  option?: boolean | CMSDependencyGraphConfig
): CMSDependencyGraphConfig | null {
  if (option === true) {
    return {};
  }
  if (option && typeof option === 'object') {
    return option;
  }
  return null;
}

function toSetOrNull(values: string[] | undefined): Set<string> | null {
  if (!values || values.length === 0) {
    return null;
  }
  return new Set(values);
}

export function resolveDependencyGraphFilters(
  config?: CMSDependencyGraphConfig
): ResolvedFilters {
  return {
    includeCollections: toSetOrNull(config?.includeCollections),
    excludeCollections: toSetOrNull(config?.excludeCollections),
  };
}

export function isCollectionTracked(
  filters: ResolvedFilters,
  collectionId: string
): boolean {
  if (
    filters.includeCollections &&
    !filters.includeCollections.has(collectionId)
  ) {
    return false;
  }
  if (filters.excludeCollections?.has(collectionId)) {
    return false;
  }
  return true;
}

/**
 * Returns the normalized doc id (`<collection>/<slug>`) when a value has the
 * shape saved by the CMS reference fields (`{id, collection, slug}` with a
 * consistent id), or `null` otherwise. Requiring the id to agree with the
 * collection/slug pair avoids false positives on arbitrary user data that
 * happens to use the same keys.
 */
export function getReferenceDocId(value: any): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const id = value.id;
  const collection = value.collection;
  const slug = value.slug;
  if (
    typeof id !== 'string' ||
    typeof collection !== 'string' ||
    typeof slug !== 'string'
  ) {
    return null;
  }
  if (!id.includes('/') || !collection || !slug) {
    return null;
  }
  let parsed: {collection: string; slug: string};
  try {
    parsed = parseDocId(id);
  } catch {
    return null;
  }
  if (parsed.collection !== collection) {
    return null;
  }
  if (parsed.slug !== normalizeSlug(slug)) {
    return null;
  }
  return `${parsed.collection}/${parsed.slug}`;
}

/**
 * Extracts the doc ids referenced by a doc's fields data. Accepts the raw
 * (marshaled) data as stored in Firestore or unmarshaled data — both plain
 * arrays and `_array` objects are traversed. Returns a sorted, de-duped list.
 */
export function extractRefDocIds(fieldsData: any): string[] {
  const refIds = new Set<string>();
  walkForRefs(fieldsData, refIds, 0);
  return Array.from(refIds).sort();
}

function walkForRefs(node: any, out: Set<string>, depth: number) {
  if (depth > MAX_WALK_DEPTH || !node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      walkForRefs(item, out, depth + 1);
    }
    return;
  }
  const refId = getReferenceDocId(node);
  if (refId) {
    out.add(refId);
    return;
  }
  for (const key of Object.keys(node)) {
    walkForRefs(node[key], out, depth + 1);
  }
}

/**
 * Normalizes a doc id to the `<collection>/<slug>` format used by graph keys
 * (slug slashes are encoded as `--`). Invalid ids are returned unchanged so
 * lookups simply miss instead of throwing.
 */
function normalizeDocId(docId: string): string {
  try {
    const parsed = parseDocId(docId);
    return `${parsed.collection}/${parsed.slug}`;
  } catch {
    return docId;
  }
}

/**
 * An in-memory snapshot of the dependency graph for a single doc mode,
 * providing forward (dependencies) and reverse (dependents) lookups.
 */
export class DependencyGraph {
  readonly mode: DocMode;
  /** Millis timestamp of the last graph update, or `null` if never built. */
  readonly lastRun: number | null;
  /** Map of doc id to the sorted list of doc ids it references. */
  readonly edges: Record<string, string[]>;
  /** Lazily-built reverse index (doc id to the doc ids that reference it). */
  private reverseEdges: Record<string, string[]> | null = null;

  constructor(
    mode: DocMode,
    edges: Record<string, string[]>,
    lastRun: number | null
  ) {
    this.mode = mode;
    this.edges = edges;
    this.lastRun = lastRun;
  }

  /**
   * Returns the doc ids referenced by the given doc(s), i.e. the additional
   * docs that need to be fetched when fetching the given docs. Resolves
   * transitively by default (references of referenced docs are included,
   * recursively; cycles are handled). The input doc ids themselves are
   * excluded from the result.
   */
  getDependencies(
    docIds: string | string[],
    options?: GetDependenciesOptions
  ): string[] {
    return this.collect(docIds, this.edges, options);
  }

  /**
   * Returns the doc ids that reference the given doc(s). Useful for finding
   * which docs are affected when a doc changes (e.g. for cache invalidation).
   * Resolves transitively by default.
   */
  getDependents(
    docIds: string | string[],
    options?: GetDependenciesOptions
  ): string[] {
    if (this.reverseEdges === null) {
      const reverse: Record<string, string[]> = {};
      for (const docId of Object.keys(this.edges)) {
        for (const refId of this.edges[docId]) {
          (reverse[refId] ??= []).push(docId);
        }
      }
      this.reverseEdges = reverse;
    }
    return this.collect(docIds, this.reverseEdges, options);
  }

  private collect(
    docIds: string | string[],
    edgeMap: Record<string, string[]>,
    options?: GetDependenciesOptions
  ): string[] {
    const transitive = options?.transitive ?? true;
    const inputIds = (Array.isArray(docIds) ? docIds : [docIds]).map(
      normalizeDocId
    );
    const result = new Set<string>();
    const visited = new Set<string>(inputIds);
    let frontier = inputIds;
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const docId of frontier) {
        for (const refId of edgeMap[docId] || []) {
          if (!visited.has(refId)) {
            visited.add(refId);
            result.add(refId);
            next.push(refId);
          }
        }
      }
      if (!transitive) {
        break;
      }
      frontier = next;
    }
    return Array.from(result).sort();
  }
}

/**
 * In-process cache of loaded graphs, keyed by `<projectId>::<mode>`. Entries
 * are invalidated when the persisted `_meta.lastRun` changes (checked on every
 * `getGraph()` call) or when a rebuild runs in this process.
 */
const graphCache = new Map<
  string,
  {lastRunMillis: number; graph: DependencyGraph}
>();

interface CmsDocData {
  fields?: any;
  [key: string]: any;
}

/**
 * Service for building, updating, and reading the persisted dependency graph.
 */
export class DependencyGraphService {
  private readonly rootConfig: RootConfig;
  private readonly projectId: string;
  private readonly db: Firestore;
  private readonly config: CMSDependencyGraphConfig | null;
  private readonly filters: ResolvedFilters;

  constructor(
    rootConfig: RootConfig,
    configOverride?: boolean | CMSDependencyGraphConfig
  ) {
    this.rootConfig = rootConfig;
    const cmsPlugin = getCmsPlugin(rootConfig);
    const cmsPluginOptions = cmsPlugin.getConfig();
    this.projectId = cmsPluginOptions.id || 'default';
    this.db = cmsPlugin.getFirestore();
    this.config = resolveDependencyGraphConfig(
      configOverride ?? cmsPluginOptions.dependencyGraph
    );
    this.filters = resolveDependencyGraphFilters(this.config || undefined);
  }

  /** Returns true if the dependency graph feature is enabled. */
  isEnabled(): boolean {
    return this.config !== null;
  }

  private assertEnabled() {
    if (!this.isEnabled()) {
      throw new Error(
        'the dependency graph is not enabled for this project. enable it in ' +
          'root.config.ts, e.g. `cmsPlugin({dependencyGraph: true})`.'
      );
    }
  }

  /** Returns true if the given collection passes the include/exclude filter. */
  isCollectionTracked(collectionId: string): boolean {
    return isCollectionTracked(this.filters, collectionId);
  }

  private graphDocPath(docId: string): string {
    return `Projects/${this.projectId}/${DEPENDENCY_GRAPH_SUBCOLLECTION}/${docId}`;
  }

  private graphCollectionPath(): string {
    return `Projects/${this.projectId}/${DEPENDENCY_GRAPH_SUBCOLLECTION}`;
  }

  private docsCollectionPath(mode: DocMode, collectionId: string): string {
    const modeCollection = mode === 'draft' ? 'Drafts' : 'Published';
    return `Projects/${this.projectId}/Collections/${collectionId}/${modeCollection}`;
  }

  /**
   * The sys timestamp that indicates a doc changed in the given mode. Draft
   * docs bump `sys.modifiedAt` on every save; published docs get a fresh
   * `sys.publishedAt` on every publish.
   */
  private changedAtField(mode: DocMode): string {
    return mode === 'draft' ? 'sys.modifiedAt' : 'sys.publishedAt';
  }

  private edgeDocId(mode: DocMode, collectionId: string): string {
    return `${mode}--${collectionId}`;
  }

  /**
   * Lists collection ids by globbing `<rootDir>/collections/*.schema.ts`,
   * filtered by the include/exclude config.
   */
  async listCollectionIds(): Promise<string[]> {
    const collectionsDir = path.join(this.rootConfig.rootDir, 'collections');
    if (!fs.existsSync(collectionsDir)) {
      return [];
    }
    const fileNames = await glob('*.schema.ts', {cwd: collectionsDir});
    return fileNames
      .map((f) => f.slice(0, -10))
      .filter((id) => this.isCollectionTracked(id))
      .sort();
  }

  private async readMeta(): Promise<DependencyGraphMeta | null> {
    const snap = await this.db.doc(this.graphDocPath(META_DOC_ID)).get();
    if (!snap.exists) {
      return null;
    }
    return (snap.data() as DependencyGraphMeta) || null;
  }

  /** Reads every edge doc in the DependencyGraph subcollection. */
  private async readEdgeDocs(): Promise<Map<string, DependencyGraphEdgeDoc>> {
    const snap = await this.db.collection(this.graphCollectionPath()).get();
    const edgeDocs = new Map<string, DependencyGraphEdgeDoc>();
    snap.forEach((doc) => {
      if (doc.id === META_DOC_ID) {
        return;
      }
      const data = doc.data() as DependencyGraphEdgeDoc;
      if (!data?.mode || !data?.collection) {
        return;
      }
      edgeDocs.set(doc.id, {
        mode: data.mode,
        collection: data.collection,
        refs: data.refs || {},
      });
    });
    return edgeDocs;
  }

  /** Commits a set of doc writes/deletes in chunked batches. */
  private async commitInChunks(
    ops: Array<(batch: WriteBatch) => void>
  ): Promise<void> {
    for (let i = 0; i < ops.length; i += BATCH_MAX_OPS) {
      const batch = this.db.batch();
      for (const op of ops.slice(i, i + BATCH_MAX_OPS)) {
        op(batch);
      }
      await batch.commit();
    }
  }

  private countRefs(edgeDocs: Map<string, DependencyGraphEdgeDoc>): {
    refDocCounts: Record<DocMode, number>;
    refCounts: Record<DocMode, number>;
  } {
    const refDocCounts: Record<DocMode, number> = {draft: 0, published: 0};
    const refCounts: Record<DocMode, number> = {draft: 0, published: 0};
    for (const edgeDoc of edgeDocs.values()) {
      for (const refIds of Object.values(edgeDoc.refs)) {
        if (refIds.length > 0) {
          refDocCounts[edgeDoc.mode] += 1;
          refCounts[edgeDoc.mode] += refIds.length;
        }
      }
    }
    return {refDocCounts, refCounts};
  }

  /**
   * Returns true when any doc changed (created, updated, published, or
   * deleted) since `lastRun`. Uses limit(1) probes for modifications and
   * count() aggregations (compared against the doc counts captured at
   * `lastRun`) for deletions, so the no-change case stays cheap.
   */
  async hasChangesSince(meta: {
    lastRun: Timestamp;
    docCounts: Record<string, number>;
  }): Promise<boolean> {
    const collectionIds = await this.listCollectionIds();
    const keys: Array<{mode: DocMode; collectionId: string; key: string}> = [];
    for (const mode of MODES) {
      for (const collectionId of collectionIds) {
        keys.push({
          mode,
          collectionId,
          key: this.edgeDocId(mode, collectionId),
        });
      }
    }

    // Probe for docs modified/published since the last run.
    const probeSnaps = await Promise.all(
      keys.map((item) =>
        this.db
          .collection(this.docsCollectionPath(item.mode, item.collectionId))
          .where(this.changedAtField(item.mode), '>=', meta.lastRun)
          .limit(1)
          .get()
      )
    );
    if (probeSnaps.some((snap) => !snap.empty)) {
      return true;
    }

    // No modified docs — compare live doc counts to detect deletions.
    const docCounts = meta.docCounts || {};
    const countSnaps = await Promise.all(
      keys.map((item) =>
        this.db
          .collection(this.docsCollectionPath(item.mode, item.collectionId))
          .count()
          .get()
      )
    );
    for (let i = 0; i < keys.length; i++) {
      const liveCount = countSnaps[i].data().count;
      if (liveCount !== (docCounts[keys[i].key] || 0)) {
        return true;
      }
    }

    // Detect collections that were removed (or newly excluded) but still have
    // tracked docs from a previous run.
    const currentKeys = new Set(keys.map((item) => item.key));
    for (const key of Object.keys(docCounts)) {
      if (!currentKeys.has(key) && docCounts[key] > 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Cron entrypoint: incrementally updates the graph when the feature is
   * enabled, the min interval has elapsed, and any doc changed since the last
   * run. Returns `null` when the update was skipped.
   */
  async runCronUpdate(options?: {
    minIntervalMs?: number;
  }): Promise<DependencyGraphRebuildResult | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const meta = await this.readMeta();
    if (meta) {
      const minIntervalMs = options?.minIntervalMs || 0;
      const elapsed = Date.now() - meta.lastRun.toMillis();
      if (minIntervalMs > 0 && elapsed < minIntervalMs) {
        return null;
      }
      const hasChanges = await this.hasChangesSince(meta);
      if (!hasChanges) {
        return null;
      }
    }
    return this.rebuildGraph({force: false});
  }

  /**
   * Orchestrates a graph rebuild (incremental by default; full when
   * `force: true`).
   */
  async rebuildGraph(
    opts: {force?: boolean} = {}
  ): Promise<DependencyGraphRebuildResult> {
    this.assertEnabled();
    const start = Date.now();
    const force = !!opts.force;
    const collectionIds = await this.listCollectionIds();
    // Capture the run timestamp before querying so that docs modified while
    // the rebuild is in flight are re-processed on the next run.
    const runStartedAt = Timestamp.now();

    let result: {skipped: boolean};
    if (force) {
      result = await this.fullRebuild(collectionIds, runStartedAt);
    } else {
      const meta = await this.readMeta();
      if (meta) {
        result = await this.incrementalRebuild(
          collectionIds,
          meta,
          runStartedAt
        );
      } else {
        // No existing graph — bootstrap with a full build.
        result = await this.fullRebuild(collectionIds, runStartedAt);
      }
    }

    const meta = await this.readMeta();
    return {
      forced: force,
      skipped: result.skipped,
      refDocCounts: meta?.refDocCounts || {draft: 0, published: 0},
      refCounts: meta?.refCounts || {draft: 0, published: 0},
      durationMs: Date.now() - start,
    };
  }

  private async fullRebuild(collectionIds: string[], runStartedAt: Timestamp) {
    const existingEdgeDocs = await this.readEdgeDocs();
    const edgeDocs = new Map<string, DependencyGraphEdgeDoc>();
    const docCounts: Record<string, number> = {};

    for (const mode of MODES) {
      for (const collectionId of collectionIds) {
        const key = this.edgeDocId(mode, collectionId);
        const snap = await this.db
          .collection(this.docsCollectionPath(mode, collectionId))
          .get();
        docCounts[key] = snap.size;
        const refs: Record<string, string[]> = {};
        snap.forEach((doc) => {
          const data = (doc.data() || {}) as CmsDocData;
          const refIds = extractRefDocIds(data.fields || {});
          if (refIds.length > 0) {
            refs[doc.id] = refIds;
          }
        });
        edgeDocs.set(key, {mode, collection: collectionId, refs});
      }
    }

    const ops: Array<(batch: WriteBatch) => void> = [];
    // Delete edge docs that no longer correspond to a tracked collection.
    for (const key of existingEdgeDocs.keys()) {
      if (!edgeDocs.has(key)) {
        const ref = this.db.doc(this.graphDocPath(key));
        ops.push((batch) => batch.delete(ref));
      }
    }
    for (const [key, edgeDoc] of edgeDocs) {
      const ref = this.db.doc(this.graphDocPath(key));
      ops.push((batch) => batch.set(ref, edgeDoc));
    }
    const {refDocCounts, refCounts} = this.countRefs(edgeDocs);
    const metaRef = this.db.doc(this.graphDocPath(META_DOC_ID));
    const meta: DependencyGraphMeta = {
      lastRun: runStartedAt,
      docCounts,
      refDocCounts,
      refCounts,
    };
    ops.push((batch) => batch.set(metaRef, meta));
    await this.commitInChunks(ops);
    this.invalidateCache();
    return {skipped: false};
  }

  private async incrementalRebuild(
    collectionIds: string[],
    prevMeta: DependencyGraphMeta,
    runStartedAt: Timestamp
  ) {
    const edgeDocs = await this.readEdgeDocs();
    const dirtyKeys = new Set<string>();
    const docCounts: Record<string, number> = {};
    const currentKeys = new Set<string>();
    const prevDocCounts = prevMeta.docCounts || {};

    for (const mode of MODES) {
      for (const collectionId of collectionIds) {
        const key = this.edgeDocId(mode, collectionId);
        currentKeys.add(key);
        const docsPath = this.docsCollectionPath(mode, collectionId);

        let edgeDoc = edgeDocs.get(key);
        if (!edgeDoc) {
          edgeDoc = {mode, collection: collectionId, refs: {}};
          edgeDocs.set(key, edgeDoc);
        }

        // Re-extract refs for docs that changed since the last run. When the
        // graph hasn't seen this collection before (e.g. a newly added or
        // newly included collection with pre-existing docs), scan every doc
        // instead — the docs may pre-date `lastRun`.
        const isNewKey = !(key in prevDocCounts);
        let changedQuery: Query = this.db.collection(docsPath);
        if (!isNewKey) {
          changedQuery = changedQuery.where(
            this.changedAtField(mode),
            '>=',
            prevMeta.lastRun
          );
        }
        const changedSnap = await changedQuery.get();
        changedSnap.forEach((doc) => {
          const data = (doc.data() || {}) as CmsDocData;
          const refIds = extractRefDocIds(data.fields || {});
          const prevRefIds = edgeDoc!.refs[doc.id];
          if (refIds.length > 0) {
            if (!prevRefIds || !stringArraysEqual(prevRefIds, refIds)) {
              edgeDoc!.refs[doc.id] = refIds;
              dirtyKeys.add(key);
            }
          } else if (prevRefIds) {
            delete edgeDoc!.refs[doc.id];
            dirtyKeys.add(key);
          }
        });

        // Reconcile deletions by diffing tracked slugs against live doc ids.
        const liveSnap = await this.db.collection(docsPath).select().get();
        docCounts[key] = liveSnap.size;
        const liveIds = new Set(liveSnap.docs.map((doc) => doc.id));
        for (const slug of Object.keys(edgeDoc.refs)) {
          if (!liveIds.has(slug)) {
            delete edgeDoc.refs[slug];
            dirtyKeys.add(key);
          }
        }
      }
    }

    // Drop edge docs for collections that are no longer tracked.
    const staleKeys: string[] = [];
    for (const key of edgeDocs.keys()) {
      if (!currentKeys.has(key)) {
        staleKeys.push(key);
      }
    }
    for (const key of staleKeys) {
      edgeDocs.delete(key);
    }

    const skipped = dirtyKeys.size === 0 && staleKeys.length === 0;
    const ops: Array<(batch: WriteBatch) => void> = [];
    for (const key of staleKeys) {
      const ref = this.db.doc(this.graphDocPath(key));
      ops.push((batch) => batch.delete(ref));
    }
    for (const key of dirtyKeys) {
      const edgeDoc = edgeDocs.get(key)!;
      const ref = this.db.doc(this.graphDocPath(key));
      ops.push((batch) => batch.set(ref, edgeDoc));
    }
    const {refDocCounts, refCounts} = this.countRefs(edgeDocs);
    const metaRef = this.db.doc(this.graphDocPath(META_DOC_ID));
    const meta: DependencyGraphMeta = {
      lastRun: runStartedAt,
      docCounts,
      refDocCounts,
      refCounts,
    };
    ops.push((batch) => batch.set(metaRef, meta));
    await this.commitInChunks(ops);
    if (!skipped) {
      this.invalidateCache();
    }
    return {skipped};
  }

  private invalidateCache() {
    for (const mode of MODES) {
      graphCache.delete(`${this.projectId}::${mode}`);
    }
  }

  /**
   * Returns the dependency graph for the given mode, loading it from
   * Firestore if necessary. Loaded graphs are cached in-process and
   * re-validated against `_meta.lastRun` on every call, so repeated calls
   * only cost a single meta doc read until the graph changes.
   */
  async getGraph(mode: DocMode): Promise<DependencyGraph> {
    this.assertEnabled();
    const meta = await this.readMeta();
    if (!meta) {
      return new DependencyGraph(mode, {}, null);
    }
    const lastRunMillis = meta.lastRun.toMillis();
    const cacheKey = `${this.projectId}::${mode}`;
    const cached = graphCache.get(cacheKey);
    if (cached && cached.lastRunMillis === lastRunMillis) {
      return cached.graph;
    }
    const snap = await this.db
      .collection(this.graphCollectionPath())
      .where('mode', '==', mode)
      .get();
    const edges: Record<string, string[]> = {};
    snap.forEach((doc) => {
      const data = doc.data() as DependencyGraphEdgeDoc;
      if (!data?.collection) {
        return;
      }
      const refs = data.refs || {};
      for (const slug of Object.keys(refs)) {
        const refIds = refs[slug];
        if (Array.isArray(refIds) && refIds.length > 0) {
          edges[`${data.collection}/${slug}`] = refIds.map(String);
        }
      }
    });
    const graph = new DependencyGraph(mode, edges, lastRunMillis);
    graphCache.set(cacheKey, {lastRunMillis, graph});
    return graph;
  }

  /** Lightweight metadata read for status endpoints. */
  async getStatus(): Promise<DependencyGraphStatus> {
    const enabled = this.isEnabled();
    const meta = enabled ? await this.readMeta() : null;
    if (!meta) {
      return {
        enabled,
        lastRun: null,
        draft: {docsWithRefs: 0, refs: 0},
        published: {docsWithRefs: 0, refs: 0},
      };
    }
    return {
      enabled,
      lastRun: meta.lastRun.toMillis(),
      draft: {
        docsWithRefs: meta.refDocCounts?.draft || 0,
        refs: meta.refCounts?.draft || 0,
      },
      published: {
        docsWithRefs: meta.refDocCounts?.published || 0,
        refs: meta.refCounts?.published || 0,
      },
    };
  }
}

function stringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
