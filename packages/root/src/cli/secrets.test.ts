import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {Command} from 'commander';
import {afterEach, assert, beforeEach, test, vi} from 'vitest';

// In-memory stand-in for Google Cloud Secret Manager, with a toggle to simulate
// a failing `gcloud` invocation (auth/permission/CLI-missing, etc.).
const {gsmStore, gcloud} = vi.hoisted(() => ({
  gsmStore: new Map<string, Record<string, string>>(),
  gcloud: {fail: false},
}));

vi.mock('../secrets/gcloud.js', () => ({
  accessSecretJson: async (gsmKey: string) => {
    if (gcloud.fail) {
      throw new Error(
        'Not authenticated with Google Cloud. Run `gcloud auth login`.'
      );
    }
    return {...(gsmStore.get(gsmKey) || {})};
  },
  writeSecretJson: async (
    gsmKey: string,
    _project: string,
    data: Record<string, string>
  ) => {
    gsmStore.set(gsmKey, {...data});
  },
}));

import {manifestPath} from '../secrets/manifest.js';
import {registerSecretsCommands} from './secrets.js';

let rootDir: string;
let cwd: string;
let exitCode: typeof process.exitCode;
let logs: string[];

beforeEach(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'root-secrets-cli-'));
  fs.writeFileSync(
    manifestPath(rootDir),
    JSON.stringify({
      version: 1,
      gcpProjectId: 'proj',
      gsmKey: 'site-a',
      secrets: {API_KEY: {updatedAt: 't1'}},
    })
  );
  cwd = process.cwd();
  process.chdir(rootDir);
  exitCode = process.exitCode;
  process.exitCode = 0;
  gsmStore.clear();
  gcloud.fail = false;
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.join(' '));
  });
});

afterEach(() => {
  process.chdir(cwd);
  process.exitCode = exitCode;
  fs.rmSync(rootDir, {recursive: true, force: true});
  delete process.env.API_KEY;
  vi.restoreAllMocks();
});

/** Runs `root secrets <args...>` against a fresh commander program. */
async function runSecrets(...args: string[]) {
  const program = new Command('root').exitOverride();
  registerSecretsCommands(program);
  await program.parseAsync(['node', 'root', 'secrets', ...args]);
}

function envExists(): boolean {
  return fs.existsSync(path.join(rootDir, '.env'));
}

test('sync exits non-zero and does not report "up to date" when gcloud fails', async () => {
  gcloud.fail = true;

  await runSecrets('sync');

  const output = logs.join('\n');
  assert.equal(process.exitCode, 1, 'a failed gcloud fetch must fail the CLI');
  assert.notInclude(output, 'up to date');
  assert.include(output, 'Not authenticated');
  assert.isFalse(envExists(), 'nothing should be written on failure');
});

test('pull also fails the CLI when gcloud fails', async () => {
  gcloud.fail = true;

  await runSecrets('pull');

  assert.equal(process.exitCode, 1);
  assert.notInclude(logs.join('\n'), 'up to date');
});

test('a successful sync writes .env, reports the update, and exits clean', async () => {
  gsmStore.set('site-a', {API_KEY: 'v1'});

  await runSecrets('sync');

  const output = logs.join('\n');
  assert.equal(process.exitCode, 0);
  assert.include(output, 'updated');
  assert.notInclude(output, 'error');
  assert.isTrue(envExists());
});
