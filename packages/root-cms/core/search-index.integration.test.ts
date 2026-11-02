// @vitest-environment node
/**
 * Integration tests for persisting large search indexes (issue #1588). The doc
 * map and the index must each be able to outgrow Firestore's 1 MiB doc limit,
 * and the index as a whole its 10 MiB commit limit.
 *
 * Requires the firestore emulator (run via `firebase emulators:exec`).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {RootConfig} from '@blinkk/root';
import {App, deleteApp, initializeApp} from 'firebase-admin/app';
import {Firestore, Timestamp, getFirestore} from 'firebase-admin/firestore';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as schema from './schema.js';
import {SearchIndexService} from './search-index.js';

const PageSchema = schema.define({
  name: 'Page',
  fields: [schema.string({id: 'title', label: 'Title'})],
}) as any;

describe('SearchIndexService persistence', () => {
  let app: App;
  let db: Firestore;
  let rootDir: string;

  beforeAll(() => {
    app = initializeApp({projectId: 'demo-search-index'}, 'search-index-test');
    db = getFirestore(app);
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'search-index-'));
    fs.mkdirSync(path.join(rootDir, 'collections'));
    fs.writeFileSync(path.join(rootDir, 'collections/Pages.schema.ts'), '');
  });

  afterAll(async () => {
    fs.rmSync(rootDir, {recursive: true, force: true});
    await deleteApp(app);
  });

  function createService(projectId: string) {
    const plugin = {
      name: 'root-cms',
      getConfig: () => ({id: projectId}),
      getFirestore: () => db,
    };
    const rootConfig = {rootDir, plugins: [plugin]} as unknown as RootConfig;
    return new SearchIndexService(rootConfig, async () => PageSchema);
  }

  /** Seeds docs whose titles are mostly unique, so they index poorly. */
  async function seedDocs(projectId: string, count: number, size = 20) {
    const writer = db.bulkWriter();
    for (let i = 0; i < count; i++) {
      const slug = `page-with-a-reasonably-long-slug-${i}`;
      const words = Array.from(
        {length: size},
        (_, j) => `word${i.toString(36)}x${j.toString(36)}`
      );
      writer.set(
        db.doc(`Projects/${projectId}/Collections/Pages/Drafts/${slug}`),
        {
          slug,
          fields: {title: words.join(' ')},
          sys: {modifiedAt: Timestamp.now()},
        }
      );
    }
    await writer.close();
  }

  function listIndexDocIds(projectId: string) {
    return db
      .collection(`Projects/${projectId}/SearchIndex`)
      .listDocuments()
      .then((refs) => refs.map((ref) => ref.id));
  }

  it('round-trips an index that exceeds the doc and commit limits', async () => {
    const projectId = 'large';
    await seedDocs(projectId, 12000, 40);
    const service = createService(projectId);

    const result = await service.rebuildIndex({force: true});
    expect(result.docCount).toBe(12000);
    // A single commit would be over 10 MiB.
    expect(result.shardCount).toBeGreaterThan(12);

    const docIds = await listIndexDocIds(projectId);
    expect(docIds.some((id) => id.includes('-docmap-'))).toBe(true);

    const {hits} = await createService(projectId).search('word1x1');
    expect(hits.length).toBeGreaterThan(0);

    // Incremental rebuilds replace the old generation.
    await db.doc(`Projects/${projectId}/Collections/Pages/Drafts/added`).set({
      slug: 'added',
      fields: {title: 'freshly added page'},
      sys: {modifiedAt: Timestamp.fromMillis(Date.now() + 1000)},
    });
    const incremental = await service.rebuildIndex();
    expect(incremental.docCount).toBe(12001);
    const nextDocIds = await listIndexDocIds(projectId);
    expect(nextDocIds).not.toEqual(expect.arrayContaining(docIds));
    const added = await createService(projectId).search('freshly');
    expect(added.hits[0]?.docId).toBe('Pages/added');
  }, 120_000);

  it('shards a doc map over the 1 MiB doc limit', async () => {
    const projectId = 'docmap';
    await seedDocs(projectId, 1, 1);
    const longKey = 'k'.repeat(200);
    const docMap: Record<string, string[]> = {};
    for (let i = 0; i < 8000; i++) {
      docMap[`Pages/${i}`] = [`Pages/${i}#${longKey}`];
    }
    const service = createService(projectId) as any;
    await service.writeIndex(
      '{}',
      docMap,
      {
        docCount: 0,
        fieldCount: 0,
        runsSinceVacuum: 0,
        lastRun: Timestamp.now(),
      },
      null
    );
    const meta = await service.readMeta();
    expect(meta.docMapShardCount).toBeGreaterThan(1);
    expect(await service.readDocMap(meta)).toEqual(docMap);
  });

  it('reads and replaces an index in the legacy format', async () => {
    const projectId = 'legacy';
    await seedDocs(projectId, 1, 1);
    const service = createService(projectId);
    await service.rebuildIndex({force: true});
    const generated = await (service as any).readMeta();
    const json = await (service as any).readShards(generated);
    const docMap = await (service as any).readDocMap(generated);

    const col = `Projects/${projectId}/SearchIndex`;
    await db.recursiveDelete(db.collection(col));
    await db.doc(`${col}/shard-0`).set({shardId: 0, data: json});
    await db.doc(`${col}/_docMap`).set({records: docMap});
    await db.doc(`${col}/_meta`).set({
      lastRun: Timestamp.now(),
      shardCount: 1,
      docCount: 1,
      fieldCount: 1,
    });

    const reader = createService(projectId);
    expect((await reader.search('word0x0')).hits.length).toBeGreaterThan(0);

    await reader.rebuildIndex({force: true});
    const docIds = await listIndexDocIds(projectId);
    expect(docIds).not.toContain('shard-0');
    expect(docIds).not.toContain('_docMap');
    expect(
      (await createService(projectId).search('word0x0')).hits.length
    ).toBeGreaterThan(0);
  });

  it('keeps the current index when a write fails partway', async () => {
    const projectId = 'failed-write';
    await seedDocs(projectId, 1, 1);
    const service = createService(projectId);
    await service.rebuildIndex({force: true});
    const before = await listIndexDocIds(projectId);

    const spy = vi
      .spyOn(service as any, 'writeChunks')
      .mockImplementationOnce(async () => {
        throw new Error('commit failed');
      });
    await expect(service.rebuildIndex({force: true})).rejects.toThrow(
      'commit failed'
    );
    spy.mockRestore();

    expect((await listIndexDocIds(projectId)).sort()).toEqual(before.sort());
    const {hits} = await createService(projectId).search('word0x0');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('rebuilds from scratch if the index shards are missing', async () => {
    const projectId = 'missing-shards';
    await seedDocs(projectId, 1, 1);
    const service = createService(projectId);
    await service.rebuildIndex({force: true});
    const docIds = await listIndexDocIds(projectId);
    const shardId = docIds.find((id) => id.includes('-shard-'))!;
    await db.doc(`Projects/${projectId}/SearchIndex/${shardId}`).delete();

    const result = await service.rebuildIndex();
    expect(result.docCount).toBe(1);
    expect(
      (await createService(projectId).search('word0x0')).hits.length
    ).toBeGreaterThan(0);
  });
});
