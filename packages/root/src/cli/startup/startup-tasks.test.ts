import {afterEach, assert, beforeEach, test, vi} from 'vitest';

// In-memory replacement for the on-disk state file.
const {store} = vi.hoisted(() => ({store: new Map<string, string>()}));

vi.mock('../../utils/fsutils.js', () => ({
  fileExists: async (filepath: string) => store.has(filepath),
  loadJson: async (filepath: string) => JSON.parse(store.get(filepath) || '{}'),
  writeJson: async (filepath: string, data: unknown) => {
    store.set(filepath, JSON.stringify(data));
  },
}));

import {runStartupTasks} from './startup-tasks.js';

beforeEach(() => {
  store.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function loggedUpdateNotice(log: ReturnType<typeof vi.spyOn>): boolean {
  return log.mock.calls.some((args) =>
    String(args[0]).includes('Update available')
  );
}

test('version check notifies once, then throttles for a day', async () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({version: '99.0.0'}),
  }));
  vi.stubGlobal('fetch', fetchMock);
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});

  await runStartupTasks({rootDir: '/tmp/project', version: '1.0.0'});
  assert.equal(fetchMock.mock.calls.length, 1);
  assert.isTrue(loggedUpdateNotice(log));

  // A second run within the throttle window skips the task entirely (no fetch).
  log.mockClear();
  await runStartupTasks({rootDir: '/tmp/project', version: '1.0.0'});
  assert.equal(fetchMock.mock.calls.length, 1);
  assert.isFalse(loggedUpdateNotice(log));
});

test('no notice when already on the latest version', async () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({version: '1.0.0'}),
  }));
  vi.stubGlobal('fetch', fetchMock);
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});

  await runStartupTasks({rootDir: '/tmp/project', version: '1.0.0'});
  assert.equal(fetchMock.mock.calls.length, 1);
  assert.isFalse(loggedUpdateNotice(log));
});

test('a failing task never throws and is still throttled', async () => {
  const fetchMock = vi.fn(async () => {
    throw new Error('network down');
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'log').mockImplementation(() => {});

  await runStartupTasks({rootDir: '/tmp/project', version: '1.0.0'});
  // The attempt is recorded even on failure, so the next run is throttled.
  await runStartupTasks({rootDir: '/tmp/project', version: '1.0.0'});
  assert.equal(fetchMock.mock.calls.length, 1);
});
