// @vitest-environment node
/**
 * Integration tests for tracking failing background jobs. Requires the
 * firestore emulator (run via `firebase emulators:exec`).
 */

import {RootConfig} from '@blinkk/root';
import {App, deleteApp, initializeApp} from 'firebase-admin/app';
import {Firestore, getFirestore} from 'firebase-admin/firestore';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {CronStatusService} from './cron-status.js';

describe('CronStatusService', () => {
  let app: App;
  let db: Firestore;
  let projectId: string;
  let service: CronStatusService;
  let testId = 0;

  beforeAll(() => {
    app = initializeApp({projectId: 'demo-cron-status'}, 'cron-status-test');
    db = getFirestore(app);
  });

  afterAll(async () => {
    await deleteApp(app);
  });

  beforeEach(() => {
    projectId = `project-${testId++}`;
    const currentProjectId = projectId;
    const plugin = {
      name: 'root-cms',
      getConfig: () => ({id: currentProjectId}),
      getFirebaseApp: () => app,
      getFirestore: () => db,
    };
    const rootConfig = {plugins: [plugin]} as unknown as RootConfig;
    service = new CronStatusService(rootConfig);
  });

  async function listActions() {
    const snapshot = await db
      .collection(`Projects/${projectId}/ActionLogs`)
      .orderBy('timestamp')
      .get();
    return snapshot.docs.map((doc) => doc.data().action);
  }

  it('counts repeat failures and logs only the first', async () => {
    await service.recordFailure('saveVersions', new Error('boom'));
    await service.recordFailure('saveVersions', new Error('boom'));
    const [failure] = await service.listFailures();
    expect(failure).toMatchObject({
      job: 'saveVersions',
      message: 'boom',
      failureCount: 2,
    });
    expect(failure.stack).toContain('boom');
    expect(await listActions()).toEqual(['cron.failed']);
  });

  it('keeps an acknowledgement until the job fails differently', async () => {
    await service.recordFailure('saveVersions', new Error('boom'));
    await service.acknowledge('saveVersions', 'admin@example.com');
    await service.recordFailure('saveVersions', new Error('boom'));
    let [failure] = await service.listFailures();
    expect(failure.acknowledgedBy).toBe('admin@example.com');

    await service.recordFailure('saveVersions', new Error('different'));
    [failure] = await service.listFailures();
    expect(failure.acknowledgedBy).toBeUndefined();
  });

  it('clears a failure and logs the recovery', async () => {
    await service.recordFailure('saveVersions', new Error('boom'));
    await service.clearFailure('saveVersions');
    await service.clearFailure('saveVersions');
    expect(await service.listFailures()).toEqual([]);
    expect(await listActions()).toEqual(['cron.failed', 'cron.recovered']);
  });
});
