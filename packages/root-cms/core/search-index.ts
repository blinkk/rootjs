/**
 * Persisted full-text search index for the CMS.
 *
 * The index is built from the `Drafts` collection of every doc in the project,
 * serialized via MiniSearch's `toJSON()`, sharded across Firestore docs (to
 * stay under the 1 MiB per-doc limit), and queried server-side by the
 * `/cms/api/search.query` endpoint.
 *
 * Persistence layout:
 *   Projects/{projectId}/SearchIndex/_meta
 *     {lastRun, generation, shardCount, docMapShardCount, docCount, fieldCount}
 *   Projects/{projectId}/SearchIndex/{generation}-shard-0..N
 *     {shardId, data}  (chunks of toJSON())
 *   Projects/{projectId}/SearchIndex/{generation}-docmap-0..N
 *     {shardId, data}  (chunks of the JSON-encoded doc map)
 *
 * An index is too large to write in a single Firestore commit, so each write
 * goes to a new "generation" of docs. `_meta` is written last and is what
 * points readers at a generation, which makes the switch to a new index atomic:
 * a write that fails partway leaves the current index untouched.
 *
 * Indexes written before generations existed have no `generation` on `_meta`.
 * They're stored in `shard-0..N` and `_docMap` ({records}), remain readable, and
 * are replaced the next time the index is written.
 *
 * Build modes:
 *   - `force: false` (cron path) — incremental: discard records for docs whose
 *     `sys.modifiedAt >= lastRun`, re-extract them, addAll. Reconcile deletions
 *     by diffing _docMap against the live doc-id set per collection.
 *   - `force: true` — drop everything and re-index every doc.
 */

import fs from 'node:fs';
import path from 'node:path';
import {RootConfig} from '@blinkk/root';
import {Firestore, Query, Timestamp} from 'firebase-admin/firestore';
import MiniSearch from 'minisearch';
import glob from 'tiny-glob';
import {getCmsPlugin} from './client.js';
import type {CMSSearchIndexConfig} from './plugin.js';
import type {SchemaWithTypes} from './schema.js';
import {extractDocRecords, ExtractedRecord} from './search-extract.js';
import {executeQuery, parseQuery} from './search-query.js';

/** Max UTF-8 bytes per shard. Leaves headroom under Firestore's 1 MiB doc cap. */
const SHARD_MAX_BYTES = 900_000;

/**
 * Max shards per commit. Firestore rejects commits over 10 MiB, and this keeps
 * a full batch of `SHARD_MAX_BYTES` shards well under that.
 */
const SHARDS_PER_BATCH = 8;

/** Max deletes per commit (Firestore's limit on writes in a batch). */
const DELETES_PER_BATCH = 500;

/**
 * Age at which a generation that isn't the current one is treated as abandoned
 * (e.g. the process died while writing it). The delay avoids deleting the docs
 * of a concurrent rebuild that hasn't finished yet.
 */
const ABANDONED_GENERATION_MS = 60 * 60 * 1000;

/** Hard ceiling that aborts a rebuild before it produces an unwieldy index. */
const MAX_INDEX_SIZE_BYTES = 50 * 1024 * 1024;

/** Run a `vacuum()` every Nth incremental update to keep the index compact. */
const VACUUM_EVERY_N_RUNS = 25;

const SEARCH_INDEX_SUBCOLLECTION = 'SearchIndex';
const META_DOC_ID = '_meta';
const LEGACY_DOC_MAP_DOC_ID = '_docMap';

/** Matches a doc from an index written before generations existed. */
const LEGACY_INDEX_DOC_RE = /^(shard-\d+|_docMap)$/;

/** Matches a doc of a generation, capturing the generation's creation time. */
const GENERATION_DOC_RE = /^(g(\d+)_[a-z0-9]+)-(shard|docmap)-\d+$/;

/** Boost-eligible terminal deepKey segments (case-insensitive match). */
const TITLEY_KEYS = new Set(['title', 'name', 'slug', 'headline', 'label']);

/** MiniSearch construction options (must match between build and load). */
const MINISEARCH_OPTIONS = {
  fields: ['text', 'fieldLabel'],
  storeFields: [
    'docId',
    'collection',
    'slug',
    'deepKey',
    'fieldLabel',
    'fieldType',
    'text',
    'weight',
  ],
  searchOptions: {
    boost: {fieldLabel: 2},
    prefix: true,
    fuzzy: 0.2,
  },
};

interface IndexableRecord extends ExtractedRecord {
  /** Per-record boost: 2 for title-like fields, 1 otherwise. */
  weight: number;
}

interface SearchIndexMeta {
  lastRun: Timestamp;
  /** The generation of docs holding the index. Unset for legacy indexes. */
  generation?: string;
  shardCount: number;
  /** Number of doc map shards in the generation. Unset for legacy indexes. */
  docMapShardCount?: number;
  docCount: number;
  fieldCount: number;
  /** How many incremental rebuilds have run since the last vacuum. */
  runsSinceVacuum?: number;
}

export interface SearchHit {
  id: string;
  docId: string;
  collection: string;
  slug: string;
  deepKey: string;
  fieldLabel: string;
  fieldType: string;
  text: string;
  score: number;
  terms: string[];
}

export interface RebuildResult {
  /** True if a full (force) rebuild was performed. */
  forced: boolean;
  /** True if the rebuild short-circuited (no work needed). */
  skipped: boolean;
  docCount: number;
  fieldCount: number;
  shardCount: number;
  durationMs: number;
}

export interface SearchIndexStatus {
  lastRun: number | null;
  docCount: number;
  fieldCount: number;
  shardCount: number;
}

interface CmsCollectionDoc {
  id?: string;
  collection?: string;
  slug?: string;
  fields?: any;
  sys?: {
    modifiedAt?: Timestamp;
    [k: string]: any;
  };
}

type DocMap = Record<string, string[]>;

/** Thrown when a doc that `_meta` refers to no longer exists. */
class MissingShardError extends Error {}

/**
 * Splits a string into chunks of at most `maxBytes` when encoded as UTF-8,
 * without separating the two halves of a surrogate pair. Firestore's limits are
 * in bytes, so chunking by chars would overflow on non-Latin content.
 */
export function chunkByUtf8Bytes(text: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  let bytes = 0;
  let i = 0;
  while (i < text.length) {
    const code = text.codePointAt(i)!;
    const size = code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    if (bytes + size > maxBytes) {
      chunks.push(text.slice(start, i));
      start = i;
      bytes = 0;
    }
    bytes += size;
    i += code > 0xffff ? 2 : 1;
  }
  if (start < text.length) {
    chunks.push(text.slice(start));
  }
  return chunks;
}

function createGeneration(): string {
  const suffix = Math.random().toString(36).slice(2, 8) || '0';
  return `g${Date.now()}_${suffix}`;
}

/**
 * Normalized form of `CMSSearchIndexConfig`. Empty arrays are treated as
 * "unset" so the user can defensively pass an empty list without accidentally
 * excluding everything via `includeCollections: []`.
 */
interface ResolvedFilters {
  includeCollections: Set<string> | null;
  excludeCollections: Set<string> | null;
  includeDocIds: Set<string> | null;
  excludeDocIds: Set<string> | null;
}

function toSetOrNull(values: string[] | undefined): Set<string> | null {
  if (!values || values.length === 0) {
    return null;
  }
  return new Set(values);
}

export function resolveSearchIndexFilters(
  config?: CMSSearchIndexConfig
): ResolvedFilters {
  return {
    includeCollections: toSetOrNull(config?.includeCollections),
    excludeCollections: toSetOrNull(config?.excludeCollections),
    includeDocIds: toSetOrNull(config?.includeDocIds),
    excludeDocIds: toSetOrNull(config?.excludeDocIds),
  };
}

export function isCollectionIndexable(
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

export function isDocIndexable(
  filters: ResolvedFilters,
  docId: string
): boolean {
  const slashIndex = docId.indexOf('/');
  if (slashIndex < 0) {
    return false;
  }
  const collectionId = docId.slice(0, slashIndex);
  if (!isCollectionIndexable(filters, collectionId)) {
    return false;
  }
  if (filters.includeDocIds && !filters.includeDocIds.has(docId)) {
    return false;
  }
  if (filters.excludeDocIds?.has(docId)) {
    return false;
  }
  return true;
}

interface CachedIndex {
  index: MiniSearch;
  meta: SearchIndexMeta;
  docMap: DocMap;
}

export function isTitleyDeepKey(deepKey: string): boolean {
  const last = deepKey.split('.').pop() || '';
  return TITLEY_KEYS.has(last.toLowerCase());
}

export function withWeight(rec: ExtractedRecord): IndexableRecord {
  return {...rec, weight: isTitleyDeepKey(rec.deepKey) ? 2 : 1};
}

/**
 * Loader for a collection's schema. Pluggable so callers can provide a
 * dev-mode loader (Vite SSR) and prod uses the default (`dist/...json`).
 *
 * Both loaders return the post-`convertOneOfTypes()` shape, where `oneOf`
 * fields hold schema *names* and the schemas themselves live on `types`.
 */
export type LoadSchemaFn = (
  collectionId: string
) => Promise<SchemaWithTypes | null>;

export class SearchIndexService {
  private readonly rootConfig: RootConfig;
  private readonly projectId: string;
  private readonly db: Firestore;
  private readonly loadSchema: LoadSchemaFn;
  private readonly filters: ResolvedFilters;
  private cached: CachedIndex | null = null;

  constructor(
    rootConfig: RootConfig,
    loadSchema?: LoadSchemaFn,
    filtersOverride?: CMSSearchIndexConfig
  ) {
    this.rootConfig = rootConfig;
    const cmsPlugin = getCmsPlugin(rootConfig);
    const cmsPluginOptions = cmsPlugin.getConfig();
    this.projectId = cmsPluginOptions.id || 'default';
    this.db = cmsPlugin.getFirestore();
    this.loadSchema =
      loadSchema || ((id) => this.loadCollectionSchemaFromDist(id));
    this.filters = resolveSearchIndexFilters(
      filtersOverride ?? cmsPluginOptions.searchIndex
    );
  }

  /** Returns true if the given collection passes the include/exclude filter. */
  isCollectionIndexable(collectionId: string): boolean {
    return isCollectionIndexable(this.filters, collectionId);
  }

  /**
   * Returns true if the given doc id passes the include/exclude filter (and
   * its collection is itself indexable). Doc ids are `<collectionId>/<slug>`.
   */
  isDocIndexable(docId: string): boolean {
    return isDocIndexable(this.filters, docId);
  }

  /** Returns the MiniSearch options used by both writers and readers. */
  static getMiniSearchOptions() {
    return MINISEARCH_OPTIONS;
  }

  private indexDocPath(docId: string): string {
    return `Projects/${this.projectId}/${SEARCH_INDEX_SUBCOLLECTION}/${docId}`;
  }

  private indexCollectionPath(): string {
    return `Projects/${this.projectId}/${SEARCH_INDEX_SUBCOLLECTION}`;
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
      .filter((id) => this.isCollectionIndexable(id));
  }

  /**
   * Default schema loader: reads `dist/collections/<id>.schema.json`. These
   * files are produced by the CMS plugin's `preBuild` hook during a real
   * `root build`. In dev there is no JSON file on disk, so callers should
   * pass a dev-aware `loadSchema` callback to the constructor (the API
   * endpoints do this — they delegate to the same Vite SSR path used by
   * `/cms/api/collection.get`).
   */
  private async loadCollectionSchemaFromDist(
    collectionId: string
  ): Promise<SchemaWithTypes | null> {
    const distPath = path.join(
      this.rootConfig.rootDir,
      'dist',
      'collections',
      `${collectionId}.schema.json`
    );
    if (!fs.existsSync(distPath)) {
      return null;
    }
    const contents = fs.readFileSync(distPath, 'utf8');
    return JSON.parse(contents) as SchemaWithTypes;
  }

  private async readMeta(): Promise<SearchIndexMeta | null> {
    const ref = this.db.doc(this.indexDocPath(META_DOC_ID));
    const snap = await ref.get();
    if (!snap.exists) {
      return null;
    }
    return (snap.data() as SearchIndexMeta) || null;
  }

  private async readDocMap(meta: SearchIndexMeta): Promise<DocMap> {
    if (!meta.generation) {
      const ref = this.db.doc(this.indexDocPath(LEGACY_DOC_MAP_DOC_ID));
      const snap = await ref.get();
      return ((snap.data() || {}).records || {}) as DocMap;
    }
    const docIds = Array.from(
      {length: meta.docMapShardCount || 0},
      (_, i) => `${meta.generation}-docmap-${i}`
    );
    const json = await this.readChunks(docIds);
    return json ? (JSON.parse(json) as DocMap) : {};
  }

  /** Reads all index shards and returns the MiniSearch JSON string. */
  private async readShards(meta: SearchIndexMeta): Promise<string> {
    const docIds = Array.from({length: meta.shardCount}, (_, i) =>
      meta.generation ? `${meta.generation}-shard-${i}` : `shard-${i}`
    );
    return this.readChunks(docIds);
  }

  /** Reads a list of shard docs and returns their concatenated data. */
  private async readChunks(docIds: string[]): Promise<string> {
    if (docIds.length === 0) {
      return '';
    }
    const refs = docIds.map((id) => this.db.doc(this.indexDocPath(id)));
    const snaps = await this.db.getAll(...refs);
    const parts: string[] = [];
    for (const snap of snaps) {
      if (!snap.exists) {
        throw new MissingShardError(
          `searchIndex: missing shard ${snap.ref.path}`
        );
      }
      const data = snap.data() || {};
      parts.push(typeof data.data === 'string' ? data.data : '');
    }
    return parts.join('');
  }

  /** Writes shard docs across as many commits as it takes. */
  private async writeChunks(
    generation: string,
    kind: 'shard' | 'docmap',
    chunks: string[]
  ) {
    for (let i = 0; i < chunks.length; i += SHARDS_PER_BATCH) {
      const batch = this.db.batch();
      chunks.slice(i, i + SHARDS_PER_BATCH).forEach((data, offset) => {
        const shardId = i + offset;
        const ref = this.db.doc(
          this.indexDocPath(`${generation}-${kind}-${shardId}`)
        );
        batch.set(ref, {shardId, data});
      });
      await batch.commit();
    }
  }

  /**
   * Writes the index to a new generation, then points `_meta` at it. If this
   * throws before `_meta` is written, the current index is left as it was.
   */
  private async writeIndex(
    serialized: string,
    docMap: DocMap,
    counts: {
      docCount: number;
      fieldCount: number;
      runsSinceVacuum: number;
      /** When the source docs were read. See `rebuildIndex()`. */
      lastRun: Timestamp;
    },
    previous: SearchIndexMeta | null
  ): Promise<{shardCount: number}> {
    const sizeBytes = Buffer.byteLength(serialized);
    if (sizeBytes > MAX_INDEX_SIZE_BYTES) {
      throw new Error(
        `searchIndex: serialized index size (${sizeBytes} bytes) ` +
          'exceeds MAX_INDEX_SIZE_BYTES. Reduce indexed fields or migrate ' +
          'to Cloud Storage.'
      );
    }
    const generation = createGeneration();
    const shards = chunkByUtf8Bytes(serialized, SHARD_MAX_BYTES);
    const docMapShards = chunkByUtf8Bytes(
      JSON.stringify(docMap),
      SHARD_MAX_BYTES
    );
    try {
      await this.writeChunks(generation, 'shard', shards);
      await this.writeChunks(generation, 'docmap', docMapShards);
    } catch (err) {
      await this.deleteDocs((id) => id.startsWith(`${generation}-`)).catch(
        (cleanupErr) => console.error(cleanupErr)
      );
      throw err;
    }
    const meta: SearchIndexMeta = {
      lastRun: counts.lastRun,
      generation,
      shardCount: shards.length,
      docMapShardCount: docMapShards.length,
      docCount: counts.docCount,
      fieldCount: counts.fieldCount,
      runsSinceVacuum: counts.runsSinceVacuum,
    };
    await this.db.doc(this.indexDocPath(META_DOC_ID)).set(meta);
    // The new index is live, so a failure from here on must not fail the build.
    await this.deleteSupersededDocs(generation, previous).catch((err) =>
      console.error('searchIndex: failed to delete old shards:', err)
    );
    // Persist a high-level marker on the project doc for client convenience.
    await this.db.doc(`Projects/${this.projectId}`).set(
      {
        searchIndexLastRun: meta.lastRun,
        searchIndexDocCount: counts.docCount,
        searchIndexFieldCount: counts.fieldCount,
      },
      {merge: true}
    );
    return {shardCount: shards.length};
  }

  /**
   * Deletes the generation that `current` replaced, the legacy index, and any
   * generations abandoned by failed writes.
   */
  private async deleteSupersededDocs(
    current: string,
    previous: SearchIndexMeta | null
  ) {
    const now = Date.now();
    await this.deleteDocs((id) => {
      if (LEGACY_INDEX_DOC_RE.test(id)) {
        return true;
      }
      const match = id.match(GENERATION_DOC_RE);
      if (!match || match[1] === current) {
        return false;
      }
      return (
        match[1] === previous?.generation ||
        now - Number(match[2]) > ABANDONED_GENERATION_MS
      );
    });
  }

  /** Deletes the docs in the SearchIndex subcollection matching `shouldDelete`. */
  private async deleteDocs(shouldDelete: (docId: string) => boolean) {
    const snap = await this.db
      .collection(this.indexCollectionPath())
      .select()
      .get();
    const refs = snap.docs.filter((d) => shouldDelete(d.id)).map((d) => d.ref);
    for (let i = 0; i < refs.length; i += DELETES_PER_BATCH) {
      const batch = this.db.batch();
      refs.slice(i, i + DELETES_PER_BATCH).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  }

  /**
   * Lists the full set of live (collection, slug, doc) tuples for `Drafts`,
   * filtered by the include/exclude config.
   */
  private async listAllDocs(
    collectionIds: string[]
  ): Promise<CmsCollectionDoc[]> {
    const all: CmsCollectionDoc[] = [];
    for (const collectionId of collectionIds) {
      const path = `Projects/${this.projectId}/Collections/${collectionId}/Drafts`;
      const snap = await this.db.collection(path).get();
      snap.forEach((d) => {
        const docId = `${collectionId}/${d.id}`;
        if (!this.isDocIndexable(docId)) {
          return;
        }
        const data = (d.data() || {}) as CmsCollectionDoc;
        if (!data.collection) data.collection = collectionId;
        if (!data.slug) data.slug = d.id;
        if (!data.id) data.id = docId;
        all.push(data);
      });
    }
    return all;
  }

  /**
   * Lists docs modified since `lastRun` across every collection, filtered by
   * the include/exclude config.
   */
  private async listChangedDocs(
    collectionIds: string[],
    lastRun: Timestamp
  ): Promise<CmsCollectionDoc[]> {
    const all: CmsCollectionDoc[] = [];
    for (const collectionId of collectionIds) {
      const path = `Projects/${this.projectId}/Collections/${collectionId}/Drafts`;
      const q: Query = this.db
        .collection(path)
        .where('sys.modifiedAt', '>=', lastRun);
      const snap = await q.get();
      snap.forEach((d) => {
        const docId = `${collectionId}/${d.id}`;
        if (!this.isDocIndexable(docId)) {
          return;
        }
        const data = (d.data() || {}) as CmsCollectionDoc;
        if (!data.collection) data.collection = collectionId;
        if (!data.slug) data.slug = d.id;
        if (!data.id) data.id = docId;
        all.push(data);
      });
    }
    return all;
  }

  /**
   * Returns true when no docs have been modified since `lastRun` AND no
   * deletions are pending (i.e. the doc-id set in `_docMap` matches the live
   * doc-id set across all collections).
   */
  async hasChangesSince(
    lastRun: Timestamp,
    docMap: DocMap | null = null
  ): Promise<boolean> {
    const collectionIds = await this.listCollectionIds();
    for (const collectionId of collectionIds) {
      const path = `Projects/${this.projectId}/Collections/${collectionId}/Drafts`;
      const q: Query = this.db
        .collection(path)
        .where('sys.modifiedAt', '>=', lastRun)
        .limit(1);
      const snap = await q.get();
      if (!snap.empty) {
        return true;
      }
    }
    // No modified docs — check for deletions.
    let map = docMap;
    if (!map) {
      const meta = await this.readMeta();
      try {
        map = meta ? await this.readDocMap(meta) : {};
      } catch (err) {
        if (err instanceof MissingShardError) {
          // Let `rebuildIndex()` repair the index.
          return true;
        }
        throw err;
      }
    }
    const knownIds = new Set(Object.keys(map));
    if (knownIds.size === 0) {
      return false;
    }
    const liveIds = new Set<string>();
    for (const collectionId of collectionIds) {
      const path = `Projects/${this.projectId}/Collections/${collectionId}/Drafts`;
      const snap = await this.db.collection(path).select().get();
      snap.forEach((d) => {
        const docId = `${collectionId}/${d.id}`;
        if (this.isDocIndexable(docId)) {
          liveIds.add(docId);
        }
      });
    }
    for (const id of knownIds) {
      if (!liveIds.has(id)) {
        return true;
      }
    }
    return false;
  }

  /** Orchestrates a rebuild (incremental by default; full when `force: true`). */
  async rebuildIndex(opts: {force?: boolean} = {}): Promise<RebuildResult> {
    const start = Date.now();
    // `lastRun` is set to when the rebuild started, rather than when it was
    // written, so that docs saved during the rebuild are picked up by the next
    // incremental run.
    const startedAt = Timestamp.now();
    const force = !!opts.force;
    const collectionIds = await this.listCollectionIds();

    if (force) {
      const result = await this.fullRebuild(
        collectionIds,
        startedAt,
        await this.readMeta()
      );
      return {
        forced: true,
        skipped: false,
        docCount: result.docCount,
        fieldCount: result.fieldCount,
        shardCount: result.shardCount,
        durationMs: Date.now() - start,
      };
    }

    const meta = await this.readMeta();
    if (!meta) {
      // No existing index — bootstrap with a full build.
      const result = await this.fullRebuild(collectionIds, startedAt, null);
      return {
        forced: false,
        skipped: false,
        docCount: result.docCount,
        fieldCount: result.fieldCount,
        shardCount: result.shardCount,
        durationMs: Date.now() - start,
      };
    }
    let result: Awaited<ReturnType<typeof this.incrementalRebuild>>;
    try {
      result = await this.incrementalRebuild(collectionIds, meta, startedAt);
    } catch (err) {
      if (!(err instanceof MissingShardError)) {
        throw err;
      }
      console.warn(`${err.message}; rebuilding the search index from scratch`);
      result = {
        skipped: false,
        ...(await this.fullRebuild(collectionIds, startedAt, meta)),
      };
    }
    return {
      forced: false,
      skipped: result.skipped,
      docCount: result.docCount,
      fieldCount: result.fieldCount,
      shardCount: result.shardCount,
      durationMs: Date.now() - start,
    };
  }

  private async fullRebuild(
    collectionIds: string[],
    startedAt: Timestamp,
    previous: SearchIndexMeta | null
  ) {
    const index = new MiniSearch(MINISEARCH_OPTIONS);
    const docMap: DocMap = {};
    let docCount = 0;
    let fieldCount = 0;
    for (const collectionId of collectionIds) {
      const schema = await this.loadSchema(collectionId);
      if (!schema) {
        console.warn(
          `searchIndex: skipping collection "${collectionId}" — schema not available. ` +
            'In dev, trigger the rebuild from Settings → Site Admin (the API ' +
            'endpoint loads schemas via Vite). In prod, ensure ' +
            `dist/collections/${collectionId}.schema.json exists.`
        );
        continue;
      }
      const path = `Projects/${this.projectId}/Collections/${collectionId}/Drafts`;
      const snap = await this.db.collection(path).get();
      snap.forEach((d) => {
        const data = (d.data() || {}) as CmsCollectionDoc;
        const slug = data.slug || d.id;
        if (!this.isDocIndexable(`${collectionId}/${slug}`)) {
          return;
        }
        const records = extractDocRecords(schema, {
          collection: collectionId,
          slug,
          fields: data.fields || {},
        });
        if (records.length === 0) {
          return;
        }
        const weighted = records.map(withWeight);
        index.addAll(weighted);
        docMap[`${collectionId}/${slug}`] = weighted.map((r) => r.id);
        docCount += 1;
        fieldCount += weighted.length;
      });
    }
    const serialized = JSON.stringify(index.toJSON());
    const {shardCount} = await this.writeIndex(
      serialized,
      docMap,
      {docCount, fieldCount, runsSinceVacuum: 0, lastRun: startedAt},
      previous
    );
    this.cached = null; // force reload on next read
    return {docCount, fieldCount, shardCount};
  }

  private async incrementalRebuild(
    collectionIds: string[],
    meta: SearchIndexMeta,
    startedAt: Timestamp
  ) {
    // Load the existing index.
    const json = await this.readShards(meta);
    const index = json
      ? MiniSearch.loadJSON(json, MINISEARCH_OPTIONS)
      : new MiniSearch(MINISEARCH_OPTIONS);
    const docMap = await this.readDocMap(meta);

    const lastRun = meta.lastRun;
    const changedDocs = await this.listChangedDocs(collectionIds, lastRun);

    // Schema lookups are amortized across changed docs.
    const schemaCache = new Map<string, SchemaWithTypes | null>();
    const getSchema = async (collectionId: string) => {
      if (!schemaCache.has(collectionId)) {
        schemaCache.set(collectionId, await this.loadSchema(collectionId));
      }
      return schemaCache.get(collectionId) || null;
    };

    let touched = 0;
    for (const doc of changedDocs) {
      const collectionId = doc.collection!;
      const slug = doc.slug!;
      const docId = `${collectionId}/${slug}`;
      const schema = await getSchema(collectionId);
      if (!schema) {
        continue;
      }
      const oldIds = docMap[docId] || [];
      for (const id of oldIds) {
        if (index.has(id)) {
          index.discard(id);
        }
      }
      const records = extractDocRecords(schema, {
        collection: collectionId,
        slug,
        fields: doc.fields || {},
      });
      if (records.length === 0) {
        delete docMap[docId];
        continue;
      }
      const weighted = records.map(withWeight);
      index.addAll(weighted);
      docMap[docId] = weighted.map((r) => r.id);
      touched += 1;
    }

    // Reconcile deletions: drop records for docs in _docMap that no longer
    // exist in any collection — or that have been newly excluded by the
    // include/exclude config (treated as a logical deletion).
    const liveIds = new Set<string>();
    for (const collectionId of collectionIds) {
      const path = `Projects/${this.projectId}/Collections/${collectionId}/Drafts`;
      const snap = await this.db.collection(path).select().get();
      snap.forEach((d) => {
        const docId = `${collectionId}/${d.id}`;
        if (this.isDocIndexable(docId)) {
          liveIds.add(docId);
        }
      });
    }
    let deletions = 0;
    for (const docId of Object.keys(docMap)) {
      if (!liveIds.has(docId)) {
        const ids = docMap[docId] || [];
        for (const id of ids) {
          if (index.has(id)) {
            index.discard(id);
          }
        }
        delete docMap[docId];
        deletions += 1;
      }
    }

    const skipped = touched === 0 && deletions === 0;
    if (skipped) {
      // Still update _meta.lastRun so the next incremental tick picks up from
      // here without re-querying everything.
      const noopMeta: SearchIndexMeta = {
        ...meta,
        lastRun: startedAt,
      };
      await this.db
        .doc(this.indexDocPath(META_DOC_ID))
        .set(noopMeta, {merge: true});
      return {
        skipped: true,
        docCount: meta.docCount,
        fieldCount: meta.fieldCount,
        shardCount: meta.shardCount,
      };
    }

    let runsSinceVacuum = (meta.runsSinceVacuum || 0) + 1;
    if (runsSinceVacuum >= VACUUM_EVERY_N_RUNS) {
      await index.vacuum();
      runsSinceVacuum = 0;
    }

    let docCount = 0;
    let fieldCount = 0;
    for (const ids of Object.values(docMap)) {
      if (ids.length > 0) {
        docCount += 1;
        fieldCount += ids.length;
      }
    }
    const serialized = JSON.stringify(index.toJSON());
    const {shardCount} = await this.writeIndex(
      serialized,
      docMap,
      {docCount, fieldCount, runsSinceVacuum, lastRun: startedAt},
      meta
    );
    this.cached = null;
    return {skipped: false, docCount, fieldCount, shardCount};
  }

  /**
   * Returns the cached MiniSearch index, loading it from Firestore if
   * necessary. The cache is keyed off `meta.lastRun` and survives across
   * requests in the same process.
   */
  async getIndex(): Promise<CachedIndex | null> {
    const meta = await this.readMeta();
    if (!meta) {
      this.cached = null;
      return null;
    }
    if (
      this.cached &&
      this.cached.meta.lastRun.toMillis() === meta.lastRun.toMillis()
    ) {
      return this.cached;
    }
    try {
      this.cached = await this.loadIndex(meta);
    } catch (err) {
      // A rebuild may have replaced the generation while it was being read, in
      // which case `_meta` now points at the new one.
      const latest = await this.readMeta();
      if (
        !(err instanceof MissingShardError) ||
        !latest ||
        latest.generation === meta.generation
      ) {
        throw err;
      }
      this.cached = await this.loadIndex(latest);
    }
    return this.cached;
  }

  private async loadIndex(meta: SearchIndexMeta): Promise<CachedIndex> {
    const json = await this.readShards(meta);
    const index = json
      ? MiniSearch.loadJSON(json, MINISEARCH_OPTIONS)
      : new MiniSearch(MINISEARCH_OPTIONS);
    const docMap = await this.readDocMap(meta);
    return {index, meta, docMap};
  }

  /** Runs a query against the loaded index. */
  async search(
    q: string,
    options: {limit?: number} = {}
  ): Promise<{hits: SearchHit[]; meta: SearchIndexStatus}> {
    const limit = Math.max(1, Math.min(options.limit || 25, 100));
    const cached = await this.getIndex();
    const status = await this.getStatus();
    if (!cached || !q.trim()) {
      return {hits: [], meta: status};
    }
    const raw = executeQuery(cached.index, parseQuery(q));
    const hits: SearchHit[] = raw.slice(0, limit).map((r: any) => ({
      id: String(r.id || ''),
      docId: String(r.docId || ''),
      collection: String(r.collection || ''),
      slug: String(r.slug || ''),
      deepKey: String(r.deepKey || ''),
      fieldLabel: String(r.fieldLabel || ''),
      fieldType: String(r.fieldType || ''),
      text: String(r.text || ''),
      score: typeof r.score === 'number' ? r.score : 0,
      terms: Array.isArray(r.terms) ? r.terms.map(String) : [],
    }));
    return {hits, meta: status};
  }

  /** Lightweight metadata read for status endpoints / settings UI. */
  async getStatus(): Promise<SearchIndexStatus> {
    const meta = await this.readMeta();
    if (!meta) {
      return {lastRun: null, docCount: 0, fieldCount: 0, shardCount: 0};
    }
    return {
      lastRun: meta.lastRun.toMillis(),
      docCount: meta.docCount,
      fieldCount: meta.fieldCount,
      shardCount: meta.shardCount,
    };
  }
}
