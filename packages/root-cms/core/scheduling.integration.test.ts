// @vitest-environment node
/**
 * Integration tests for scheduled publishing (issue #1550).
 *
 * Scheduling state is stored in two places: `sys.scheduledAt` on the draft doc
 * (which drives the CMS UI) and the `Scheduled/<slug>` doc (which drives the
 * cron publisher). These tests verify the two stay in sync and that scheduled
 * publishing respects publishing locks and archiving.
 *
 * Requires the firestore emulator (run via `firebase emulators:exec`).
 */

import {App, deleteApp, initializeApp} from 'firebase-admin/app';
import {Firestore, Timestamp, getFirestore} from 'firebase-admin/firestore';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {RootCMSClient} from './client.js';

function createTestClient(db: Firestore, projectId: string): RootCMSClient {
  const client = Object.create(RootCMSClient.prototype);
  Object.assign(client, {
    projectId,
    db,
    user: 'root-cms-client',
    logActions: true,
    cmsPlugin: {
      getConfig: () => ({
        experiments: {v2TranslationsManager: false},
        dependencyGraph: false,
      }),
    },
  });
  return client as RootCMSClient;
}

/**
 * Seeds a draft doc and a matching `Scheduled` snapshot, mirroring what
 * `cmsScheduleDoc()` writes in the CMS UI.
 */
async function seedScheduledDoc(
  db: Firestore,
  projectId: string,
  slug: string,
  options?: {scheduledAt?: Timestamp; draftSys?: Record<string, any>}
) {
  const collectionPath = `Projects/${projectId}/Collections/pages`;
  const modifiedAt = Timestamp.fromMillis(Date.now() - 60000);
  const scheduledAt =
    options?.scheduledAt ?? Timestamp.fromMillis(Date.now() - 1000);
  const data = {
    id: `pages/${slug}`,
    collection: 'pages',
    slug,
    sys: {
      createdAt: modifiedAt,
      createdBy: 'seed@example.com',
      modifiedAt,
      modifiedBy: 'seed@example.com',
      scheduledAt,
      scheduledBy: 'scheduler@example.com',
    },
    fields: {title: 'scheduled title'},
  };
  await db.doc(`${collectionPath}/Scheduled/${slug}`).set(data);
  await db.doc(`${collectionPath}/Drafts/${slug}`).set({
    ...data,
    sys: {...data.sys, ...options?.draftSys},
  });
}

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  'scheduled publishing (issue #1550)',
  () => {
    let app: App;
    let db: Firestore;

    beforeAll(() => {
      app = initializeApp({projectId: 'demo-issue-1550'}, 'issue-1550');
      db = getFirestore(app);
    });

    afterAll(async () => {
      await deleteApp(app);
    });

    it('unpublishDocs() clears the schedule from the draft', async () => {
      const projectId = 'unpublish-scheduled-test';
      const client = createTestClient(db, projectId);
      await seedScheduledDoc(db, projectId, 'foo', {
        scheduledAt: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      });

      await client.unpublishDocs(['pages/foo']);

      const collectionPath = `Projects/${projectId}/Collections/pages`;
      const draft = (await db.doc(`${collectionPath}/Drafts/foo`).get()).data();
      expect(draft?.sys?.scheduledAt).toBeUndefined();
      expect(draft?.sys?.scheduledBy).toBeUndefined();
      const scheduled = await db.doc(`${collectionPath}/Scheduled/foo`).get();
      expect(scheduled.exists).toBe(false);
    });

    it('publishScheduledDocs() keeps newer draft edits unpublished', async () => {
      const projectId = 'scheduled-newer-edits-test';
      const client = createTestClient(db, projectId);
      // The draft was edited after the doc was scheduled.
      await seedScheduledDoc(db, projectId, 'edited', {
        draftSys: {modifiedAt: Timestamp.fromMillis(Date.now() - 30000)},
      });
      await seedScheduledDoc(db, projectId, 'unedited');

      const published = await client.publishScheduledDocs();
      expect(published.map((doc) => doc.id).sort()).toEqual([
        'pages/edited',
        'pages/unedited',
      ]);

      const collectionPath = `Projects/${projectId}/Collections/pages`;
      const edited = (
        await db.doc(`${collectionPath}/Drafts/edited`).get()
      ).data()!;
      expect(edited.sys.scheduledAt).toBeUndefined();
      expect(edited.sys.modifiedAt.toMillis()).toBeGreaterThan(
        edited.sys.publishedAt.toMillis()
      );

      const unedited = (
        await db.doc(`${collectionPath}/Drafts/unedited`).get()
      ).data()!;
      expect(unedited.sys.scheduledAt).toBeUndefined();
      expect(unedited.sys.publishedAt.toMillis()).toBeGreaterThan(
        unedited.sys.modifiedAt.toMillis()
      );
    });

    it('publishScheduledDocs() skips locked and archived docs', async () => {
      const projectId = 'scheduled-locked-test';
      const client = createTestClient(db, projectId);
      await seedScheduledDoc(db, projectId, 'locked', {
        draftSys: {
          publishingLocked: {
            lockedAt: Timestamp.now(),
            lockedBy: 'locker@example.com',
            reason: 'embargo',
          },
        },
      });
      await seedScheduledDoc(db, projectId, 'archived', {
        draftSys: {
          archivedAt: Timestamp.now(),
          archivedBy: 'archiver@example.com',
        },
      });
      await seedScheduledDoc(db, projectId, 'ok');

      const published = await client.publishScheduledDocs();
      expect(published.map((doc) => doc.id)).toEqual(['pages/ok']);

      const collectionPath = `Projects/${projectId}/Collections/pages`;
      for (const slug of ['locked', 'archived']) {
        const publishedDoc = await db
          .doc(`${collectionPath}/Published/${slug}`)
          .get();
        expect(publishedDoc.exists).toBe(false);
      }
      // The locked doc remains scheduled so that it is published once the
      // lock is removed.
      const lockedScheduled = await db
        .doc(`${collectionPath}/Scheduled/locked`)
        .get();
      expect(lockedScheduled.exists).toBe(true);
    });

    it('publishScheduledReleases() skips archived releases and isolates failures', async () => {
      const projectId = 'scheduled-releases-test';
      const client = createTestClient(db, projectId);
      const collectionPath = `Projects/${projectId}/Collections/pages`;
      for (const slug of ['a', 'b', 'c']) {
        await db.doc(`${collectionPath}/Drafts/${slug}`).set({
          id: `pages/${slug}`,
          collection: 'pages',
          slug,
          sys: {
            createdAt: Timestamp.now(),
            createdBy: 'seed@example.com',
            modifiedAt: Timestamp.now(),
            modifiedBy: 'seed@example.com',
            ...(slug === 'b'
              ? {
                  publishingLocked: {
                    lockedAt: Timestamp.now(),
                    lockedBy: 'locker@example.com',
                    reason: 'embargo',
                  },
                }
              : {}),
          },
          fields: {title: slug},
        });
      }
      const scheduledAt = Timestamp.fromMillis(Date.now() - 1000);
      const releases: Record<string, string[]> = {
        archived: ['pages/a'],
        locked: ['pages/b'],
        ok: ['pages/c'],
      };
      for (const [id, docIds] of Object.entries(releases)) {
        await db.doc(`Projects/${projectId}/Releases/${id}`).set({
          id,
          docIds,
          scheduledAt,
          scheduledBy: 'scheduler@example.com',
          ...(id === 'archived'
            ? {
                archivedAt: Timestamp.now(),
                archivedBy: 'archiver@example.com',
              }
            : {}),
        });
      }

      // The locked release fails, but the other release is still published.
      await expect(client.publishScheduledReleases()).rejects.toThrow(
        'failed to publish 1 scheduled release(s)'
      );

      const exists = async (slug: string) =>
        (await db.doc(`${collectionPath}/Published/${slug}`).get()).exists;
      expect(await exists('a')).toBe(false);
      expect(await exists('b')).toBe(false);
      expect(await exists('c')).toBe(true);

      const lockedRelease = (
        await db.doc(`Projects/${projectId}/Releases/locked`).get()
      ).data()!;
      expect(lockedRelease.scheduledAt).toBeDefined();
      expect(lockedRelease.publishedAt).toBeUndefined();
    });

    it('publishDocs() rejects archived docs', async () => {
      const projectId = 'publish-archived-test';
      const client = createTestClient(db, projectId);
      await db.doc(`Projects/${projectId}/Collections/pages/Drafts/foo`).set({
        id: 'pages/foo',
        collection: 'pages',
        slug: 'foo',
        sys: {
          createdAt: Timestamp.now(),
          createdBy: 'seed@example.com',
          modifiedAt: Timestamp.now(),
          modifiedBy: 'seed@example.com',
          archivedAt: Timestamp.now(),
          archivedBy: 'archiver@example.com',
        },
        fields: {},
      });
      await expect(client.publishDocs(['pages/foo'])).rejects.toThrow(
        'cannot publish archived doc: pages/foo'
      );
    });
  }
);
