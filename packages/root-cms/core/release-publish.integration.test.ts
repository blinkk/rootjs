// @vitest-environment node
/**
 * Integration test for release publishing limits (issue #457).
 *
 * Publishing a release used to fail when it contained more than ~30 docs
 * (firestore `in` query limit) or more than 100 docs (write batch reuse after
 * commit). These tests run the real `RootCMSClient` publishing flow against
 * the firestore emulator with 120 docs to verify releases are not limited in
 * the number of docs they contain.
 *
 * Requires the firestore emulator (run via `firebase emulators:exec`).
 */

import {App, deleteApp, initializeApp} from 'firebase-admin/app';
import {Firestore, Timestamp, getFirestore} from 'firebase-admin/firestore';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {RootCMSClient} from './client.js';

const NUM_DOCS = 120;

/**
 * Creates a `RootCMSClient` bound to the emulator db without requiring a full
 * root config / CMS plugin setup. The publishing methods under test only use
 * `db`, `projectId` and the cms plugin config (via `logAction()`).
 */
function createTestClient(db: Firestore, projectId: string): RootCMSClient {
  const client = Object.create(RootCMSClient.prototype);
  Object.assign(client, {
    projectId,
    db,
    cmsPlugin: {getConfig: () => ({})},
  });
  return client as RootCMSClient;
}

async function seedDraftDocs(
  db: Firestore,
  projectId: string,
  collectionId: string,
  slugs: string[]
) {
  const draftsPath = `Projects/${projectId}/Collections/${collectionId}/Drafts`;
  let batch = db.batch();
  let count = 0;
  for (const slug of slugs) {
    batch.set(db.doc(`${draftsPath}/${slug}`), {
      id: `${collectionId}/${slug}`,
      collection: collectionId,
      slug: slug,
      sys: {
        createdAt: Timestamp.now(),
        createdBy: 'seed@example.com',
        modifiedAt: Timestamp.now(),
        modifiedBy: 'seed@example.com',
      },
      fields: {title: `title for ${slug}`},
    });
    count += 1;
    if (count >= 400) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }
  if (count > 0) {
    await batch.commit();
  }
}

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  'release publishing (issue #457)',
  () => {
    let app: App;
    let db: Firestore;

    beforeAll(() => {
      app = initializeApp({projectId: 'demo-issue-457'}, 'issue-457');
      db = getFirestore(app);
    });

    afterAll(async () => {
      await deleteApp(app);
    });

    it(
      `publishDocs() publishes ${NUM_DOCS} docs at once`,
      {timeout: 60000},
      async () => {
        const projectId = 'publish-docs-test';
        const client = createTestClient(db, projectId);
        const slugs = Array.from({length: NUM_DOCS}, (_, i) => `page-${i}`);
        const docIds = slugs.map((slug) => `pages/${slug}`);
        await seedDraftDocs(db, projectId, 'pages', slugs);

        const publishedDocs = await client.publishDocs(docIds, {
          publishedBy: 'publisher@example.com',
        });
        expect(publishedDocs).toHaveLength(NUM_DOCS);

        // Verify all docs were copied to the "Published" collection.
        const publishedSnapshot = await db
          .collection(`Projects/${projectId}/Collections/pages/Published`)
          .get();
        expect(publishedSnapshot.size).toBe(NUM_DOCS);
        const published = await db
          .doc(`Projects/${projectId}/Collections/pages/Published/page-119`)
          .get();
        expect(published.exists).toBe(true);
        expect(published.data()?.fields?.title).toBe('title for page-119');
        expect(published.data()?.sys?.publishedBy).toBe(
          'publisher@example.com'
        );
      }
    );

    it(
      `publishScheduledReleases() publishes a release with ${NUM_DOCS} docs`,
      {timeout: 60000},
      async () => {
        const projectId = 'scheduled-release-test';
        const client = createTestClient(db, projectId);
        const releaseId = 'big-release';
        const slugs = Array.from({length: NUM_DOCS}, (_, i) => `page-${i}`);
        const docIds = slugs.map((slug) => `pages/${slug}`);
        await seedDraftDocs(db, projectId, 'pages', slugs);

        // Schedule a release containing all of the docs.
        const releaseRef = db.doc(
          `Projects/${projectId}/Releases/${releaseId}`
        );
        await releaseRef.set({
          id: releaseId,
          docIds: docIds,
          createdAt: Timestamp.now(),
          createdBy: 'scheduler@example.com',
          scheduledAt: Timestamp.fromMillis(Date.now() - 1000),
          scheduledBy: 'scheduler@example.com',
        });

        await client.publishScheduledReleases();

        // Verify all docs in the release were published.
        const publishedSnapshot = await db
          .collection(`Projects/${projectId}/Collections/pages/Published`)
          .get();
        expect(publishedSnapshot.size).toBe(NUM_DOCS);

        // Verify the version snapshot is tagged with the release id.
        const versionsSnapshot = await db
          .collection(
            `Projects/${projectId}/Collections/pages/Drafts/page-0/Versions`
          )
          .get();
        expect(versionsSnapshot.size).toBe(1);
        expect(versionsSnapshot.docs[0].data().tags).toContain(
          `release:${releaseId}`
        );

        // Verify the release was marked as published.
        const release = (await releaseRef.get()).data()!;
        expect(release.publishedAt).toBeDefined();
        expect(release.publishedBy).toBe('scheduler@example.com');
        expect(release.scheduledAt).toBeUndefined();
        expect(release.scheduledBy).toBeUndefined();
      }
    );
  }
);
