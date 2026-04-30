/**
 * Persisted full-text search index for the CMS.
 *
 * The index is built from the `Drafts` collection of every doc in the project,
 * serialized via MiniSearch's `toJSON()`, sharded across Firestore docs (to
 * stay under the 1 MB per-doc limit), and queried server-side by the
 * `/cms/api/search.query` endpoint.
 *
 * Persistence layout:
 *   Projects/{projectId}/SearchIndex/_meta        — {lastRun, shardCount, docCount, fieldCount}
 *   Projects/{projectId}/SearchIndex/_docMap      — {records: {[docId]: recordIds[]}}
 *   Projects/{projectId}/SearchIndex/shard-0..N   — {shardId, data}  (chunks of toJSON())
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
import type {Schema} from './schema.js';
import {extractDocRecords, ExtractedRecord} from './search-extract.js';

/** Max chars per shard. Leaves headroom under the Firestore 1 MB doc cap. */
const SHARD_MAX_CHARS = 500_000;

/** Hard ceiling that aborts a rebuild before it produces an unwieldy index. */
const MAX_INDEX_SIZE_BYTES = 50 * 1024 * 1024;

/** Run a `vacuum()` every Nth incremental update to keep the index compact. */
const VACUUM_EVERY_N_RUNS = 25;

const SEARCH_INDEX_SUBCOLLECTION = 'SearchIndex';
const META_DOC_ID = '_meta';
const DOC_MAP_DOC_ID = '_docMap';

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
  shardCount: number;
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

export class SearchIndexService {
  private readonly rootConfig: RootConfig;
  private readonly projectId: string;
  private readonly db: Firestore;
  private cached: CachedIndex | null = null;

  constructor(rootConfig: RootConfig) {
    this.rootConfig = rootConfig;
    const cmsPlugin = getCmsPlugin(rootConfig);
    const cmsPluginOptions = cmsPlugin.getConfig();
    this.projectId = cmsPluginOptions.id || 'default';
    this.db = cmsPlugin.getFirestore();
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

  /** Lists collection ids by globbing `<rootDir>/collections/*.schema.ts`. */
  async listCollectionIds(): Promise<string[]> {
    const collectionsDir = path.join(this.rootConfig.rootDir, 'collections');
    if (!fs.existsSync(collectionsDir)) {
      return [];
    }
    const fileNames = await glob('*.schema.ts', {cwd: collectionsDir});
    return fileNames.map((f) => f.slice(0, -10));
  }

  /**
   * Loads a collection's schema from `dist/collections/<id>.schema.json` (or
   * dynamically imports the .ts file as a fallback for dev).
   */
  private async loadCollectionSchema(
    collectionId: string
  ): Promise<Schema | null> {
    const distPath = path.join(
      this.rootConfig.rootDir,
      'dist',
      'collections',
      `${collectionId}.schema.json`
    );
    if (fs.existsSync(distPath)) {
      const contents = fs.readFileSync(distPath, 'utf8');
      return JSON.parse(contents) as Schema;
    }
    const tsPath = path.join(
      this.rootConfig.rootDir,
      'collections',
      `${collectionId}.schema.ts`
    );
    if (fs.existsSync(tsPath)) {
      try {
        const mod = await import(tsPath);
        const exported = mod?.default ?? mod;
        if (exported && typeof exported === 'object' && 'fields' in exported) {
          return exported as Schema;
        }
      } catch (err) {
        console.warn(`searchIndex: failed to load schema ${collectionId}`, err);
      }
    }
    return null;
  }

  private async readMeta(): Promise<SearchIndexMeta | null> {
    const ref = this.db.doc(this.indexDocPath(META_DOC_ID));
    const snap = await ref.get();
    if (!snap.exists) {
      return null;
    }
    return (snap.data() as SearchIndexMeta) || null;
  }

  private async readDocMap(): Promise<DocMap> {
    const ref = this.db.doc(this.indexDocPath(DOC_MAP_DOC_ID));
    const snap = await ref.get();
    if (!snap.exists) {
      return {};
    }
    const data = snap.data() || {};
    const records = (data.records || {}) as DocMap;
    return records;
  }

  /** Reads all shard docs and returns the concatenated MiniSearch JSON string. */
  private async readShards(shardCount: number): Promise<string> {
    if (shardCount <= 0) {
      return '';
    }
    const refs = Array.from({length: shardCount}, (_, i) =>
      this.db.doc(this.indexDocPath(`shard-${i}`))
    );
    const snaps = await this.db.getAll(...refs);
    const parts: string[] = [];
    for (const snap of snaps) {
      if (!snap.exists) {
        throw new Error(`searchIndex: missing shard ${snap.ref.path}`);
      }
      const data = snap.data() || {};
      parts.push(typeof data.data === 'string' ? data.data : '');
    }
    return parts.join('');
  }

  /** Writes shards, _docMap, _meta in one batched commit. */
  private async writeIndex(
    serialized: string,
    docMap: DocMap,
    counts: {docCount: number; fieldCount: number; runsSinceVacuum: number},
    existingShardCount: number
  ): Promise<{shardCount: number}> {
    if (serialized.length > MAX_INDEX_SIZE_BYTES) {
      throw new Error(
        `searchIndex: serialized index size (${serialized.length} chars) ` +
          'exceeds MAX_INDEX_SIZE_BYTES. Reduce indexed fields or migrate ' +
          'to Cloud Storage.'
      );
    }
    const shards: string[] = [];
    for (let i = 0; i < serialized.length; i += SHARD_MAX_CHARS) {
      shards.push(serialized.slice(i, i + SHARD_MAX_CHARS));
    }
    const newShardCount = shards.length;

    // Firestore batches max out at 500 ops, but we never approach that here.
    const batch = this.db.batch();
    shards.forEach((data, i) => {
      const ref = this.db.doc(this.indexDocPath(`shard-${i}`));
      batch.set(ref, {shardId: i, data});
    });
    // Delete any orphaned shards from a previous larger index.
    for (let i = newShardCount; i < existingShardCount; i++) {
      const ref = this.db.doc(this.indexDocPath(`shard-${i}`));
      batch.delete(ref);
    }
    const docMapRef = this.db.doc(this.indexDocPath(DOC_MAP_DOC_ID));
    batch.set(docMapRef, {records: docMap});
    const metaRef = this.db.doc(this.indexDocPath(META_DOC_ID));
    const meta: SearchIndexMeta = {
      lastRun: Timestamp.now(),
      shardCount: newShardCount,
      docCount: counts.docCount,
      fieldCount: counts.fieldCount,
      runsSinceVacuum: counts.runsSinceVacuum,
    };
    batch.set(metaRef, meta);
    await batch.commit();
    // Persist a high-level marker on the project doc for client convenience.
    await this.db.doc(`Projects/${this.projectId}`).set(
      {
        searchIndexLastRun: meta.lastRun,
        searchIndexDocCount: counts.docCount,
        searchIndexFieldCount: counts.fieldCount,
      },
      {merge: true}
    );
    return {shardCount: newShardCount};
  }

  /** Drops every doc under the SearchIndex subcollection. */
  private async wipeIndex(): Promise<void> {
    const snap = await this.db.collection(this.indexCollectionPath()).get();
    if (snap.empty) {
      return;
    }
    const batch = this.db.batch();
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  /** Lists the full set of live (collection, slug, doc) tuples for `Drafts`. */
  private async listAllDocs(
    collectionIds: string[]
  ): Promise<CmsCollectionDoc[]> {
    const all: CmsCollectionDoc[] = [];
    for (const collectionId of collectionIds) {
      const path = `Projects/${this.projectId}/Collections/${collectionId}/Drafts`;
      const snap = await this.db.collection(path).get();
      snap.forEach((d) => {
        const data = (d.data() || {}) as CmsCollectionDoc;
        if (!data.collection) data.collection = collectionId;
        if (!data.slug) data.slug = d.id;
        if (!data.id) data.id = `${collectionId}/${d.id}`;
        all.push(data);
      });
    }
    return all;
  }

  /** Lists docs modified since `lastRun` across every collection. */
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
        const data = (d.data() || {}) as CmsCollectionDoc;
        if (!data.collection) data.collection = collectionId;
        if (!data.slug) data.slug = d.id;
        if (!data.id) data.id = `${collectionId}/${d.id}`;
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
    const map = docMap ?? (await this.readDocMap());
    const knownIds = new Set(Object.keys(map));
    if (knownIds.size === 0) {
      return false;
    }
    const liveIds = new Set<string>();
    for (const collectionId of collectionIds) {
      const path = `Projects/${this.projectId}/Collections/${collectionId}/Drafts`;
      const snap = await this.db.collection(path).select().get();
      snap.forEach((d) => liveIds.add(`${collectionId}/${d.id}`));
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
    const force = !!opts.force;
    const collectionIds = await this.listCollectionIds();

    if (force) {
      const result = await this.fullRebuild(collectionIds);
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
      const result = await this.fullRebuild(collectionIds);
      return {
        forced: false,
        skipped: false,
        docCount: result.docCount,
        fieldCount: result.fieldCount,
        shardCount: result.shardCount,
        durationMs: Date.now() - start,
      };
    }
    const result = await this.incrementalRebuild(collectionIds, meta);
    return {
      forced: false,
      skipped: result.skipped,
      docCount: result.docCount,
      fieldCount: result.fieldCount,
      shardCount: result.shardCount,
      durationMs: Date.now() - start,
    };
  }

  private async fullRebuild(collectionIds: string[]) {
    await this.wipeIndex();
    const index = new MiniSearch(MINISEARCH_OPTIONS);
    const docMap: DocMap = {};
    let docCount = 0;
    let fieldCount = 0;
    for (const collectionId of collectionIds) {
      const schema = await this.loadCollectionSchema(collectionId);
      if (!schema) {
        continue;
      }
      const path = `Projects/${this.projectId}/Collections/${collectionId}/Drafts`;
      const snap = await this.db.collection(path).get();
      snap.forEach((d) => {
        const data = (d.data() || {}) as CmsCollectionDoc;
        const slug = data.slug || d.id;
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
      {docCount, fieldCount, runsSinceVacuum: 0},
      0
    );
    this.cached = null; // force reload on next read
    return {docCount, fieldCount, shardCount};
  }

  private async incrementalRebuild(
    collectionIds: string[],
    meta: SearchIndexMeta
  ) {
    // Load the existing index.
    const json = await this.readShards(meta.shardCount);
    const index = json
      ? MiniSearch.loadJSON(json, MINISEARCH_OPTIONS)
      : new MiniSearch(MINISEARCH_OPTIONS);
    const docMap = await this.readDocMap();

    const lastRun = meta.lastRun;
    const changedDocs = await this.listChangedDocs(collectionIds, lastRun);

    // Schema lookups are amortized across changed docs.
    const schemaCache = new Map<string, Schema | null>();
    const getSchema = async (collectionId: string) => {
      if (!schemaCache.has(collectionId)) {
        schemaCache.set(
          collectionId,
          await this.loadCollectionSchema(collectionId)
        );
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
    // exist in any collection.
    const liveIds = new Set<string>();
    for (const collectionId of collectionIds) {
      const path = `Projects/${this.projectId}/Collections/${collectionId}/Drafts`;
      const snap = await this.db.collection(path).select().get();
      snap.forEach((d) => liveIds.add(`${collectionId}/${d.id}`));
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
        lastRun: Timestamp.now(),
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
      {docCount, fieldCount, runsSinceVacuum},
      meta.shardCount
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
    const json = await this.readShards(meta.shardCount);
    const index = json
      ? MiniSearch.loadJSON(json, MINISEARCH_OPTIONS)
      : new MiniSearch(MINISEARCH_OPTIONS);
    const docMap = await this.readDocMap();
    this.cached = {index, meta, docMap};
    return this.cached;
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
    const raw = cached.index.search(q.trim());
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
