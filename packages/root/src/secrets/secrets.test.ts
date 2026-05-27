import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterEach, assert, beforeEach, test, vi} from 'vitest';

// In-memory stand-in for Google Cloud Secret Manager.
const {gsmStore, gsmErrors, accessLog} = vi.hoisted(() => ({
  gsmStore: new Map<string, Record<string, string>>(),
  gsmErrors: new Set<string>(),
  accessLog: [] as string[],
}));

vi.mock('./gcloud.js', () => ({
  accessSecretJson: async (gsmKey: string) => {
    accessLog.push(gsmKey);
    if (gsmErrors.has(gsmKey)) {
      throw new Error(`fetch failed for ${gsmKey}`);
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

import {parseEnv} from './env-file.js';
import {
  emptyManifest,
  Manifest,
  manifestPath,
  readManifest,
  writeManifest,
} from './manifest.js';
import {
  getSecretsStatus,
  pushEnvToSecrets,
  localStatePath,
  removeSecret,
  setSecret,
  syncSecrets,
} from './secrets.js';

let rootDir: string;

beforeEach(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'root-sync-'));
  gsmStore.clear();
  gsmErrors.clear();
  accessLog.length = 0;
});

afterEach(() => {
  fs.rmSync(rootDir, {recursive: true, force: true});
  // syncSecrets sets process.env for managed keys when apply is true.
  for (const key of ['API_KEY', 'OTHER', 'DATABASE_URL']) {
    delete process.env[key];
  }
  vi.restoreAllMocks();
});

function writeSiteManifest(
  secrets: Manifest['secrets'],
  extra: Partial<Manifest> = {}
) {
  const manifest = emptyManifest('proj', 'site-a');
  manifest.secrets = secrets;
  Object.assign(manifest, extra);
  fs.writeFileSync(manifestPath(rootDir), JSON.stringify(manifest, null, 2));
}

function readEnv(): Record<string, string> {
  const envPath = path.join(rootDir, '.env');
  return parseEnv(
    fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
  );
}

function readState(): {
  salt?: string;
  secrets: Record<string, {updatedAt: string; hash: string}>;
} {
  const file = localStatePath(rootDir);
  return fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : {secrets: {}};
}

test('first sync pulls the remote value into .env and records state', async () => {
  writeSiteManifest({API_KEY: {updatedAt: 't1'}});
  gsmStore.set('site-a', {API_KEY: 'v1'});

  const result = await syncSecrets({rootDir, apply: true});
  assert.deepEqual(result.changed, ['API_KEY']);
  assert.equal(readEnv().API_KEY, 'v1');
  assert.equal(readState().secrets.API_KEY.updatedAt, 't1');
  assert.equal(process.env.API_KEY, 'v1');

  // The stored hash is salted, not a bare sha256 of the value.
  const state = readState();
  assert.isString(state.salt);
  assert.equal(state.salt!.length, 32);
  const bareSha = crypto.createHash('sha256').update('v1').digest('hex');
  assert.notEqual(state.secrets.API_KEY.hash, bareSha);
});

test('a second sync with no changes is a no-op', async () => {
  writeSiteManifest({API_KEY: {updatedAt: 't1'}});
  gsmStore.set('site-a', {API_KEY: 'v1'});
  await syncSecrets({rootDir, apply: true});

  accessLog.length = 0;
  const result = await syncSecrets({rootDir, apply: true});
  assert.deepEqual(result.changed, []);
  // No remote change for any key, so no blob is fetched.
  assert.deepEqual(accessLog, []);
});

test('a remote change is pulled when the value was not edited locally', async () => {
  writeSiteManifest({API_KEY: {updatedAt: 't1'}});
  gsmStore.set('site-a', {API_KEY: 'v1'});
  await syncSecrets({rootDir, apply: true});

  writeSiteManifest({API_KEY: {updatedAt: 't2'}});
  gsmStore.set('site-a', {API_KEY: 'v2'});
  const result = await syncSecrets({rootDir, apply: true});
  assert.deepEqual(result.changed, ['API_KEY']);
  assert.equal(readEnv().API_KEY, 'v2');
});

test('a local edit is kept when the remote did not change', async () => {
  writeSiteManifest({API_KEY: {updatedAt: 't1'}});
  gsmStore.set('site-a', {API_KEY: 'v1'});
  await syncSecrets({rootDir, apply: true});

  fs.writeFileSync(path.join(rootDir, '.env'), "API_KEY='local-override'\n");
  accessLog.length = 0;
  const result = await syncSecrets({rootDir, apply: true});
  assert.deepEqual(result.kept, ['API_KEY']);
  assert.deepEqual(accessLog, []); // no remote change -> no fetch
  assert.equal(readEnv().API_KEY, 'local-override');
});

test('a value changed both locally and remotely is a conflict; pull takes remote', async () => {
  writeSiteManifest({API_KEY: {updatedAt: 't1'}});
  gsmStore.set('site-a', {API_KEY: 'v1'});
  await syncSecrets({rootDir, apply: true});

  // Local edit + remote rotation.
  fs.writeFileSync(path.join(rootDir, '.env'), "API_KEY='mine'\n");
  writeSiteManifest({API_KEY: {updatedAt: 't2'}});
  gsmStore.set('site-a', {API_KEY: 'theirs'});

  const conflict = await syncSecrets({rootDir, apply: true});
  assert.deepEqual(conflict.conflicts, ['API_KEY']);
  assert.equal(readEnv().API_KEY, 'mine'); // local kept

  const pulled = await syncSecrets({rootDir, apply: true, force: true});
  assert.deepEqual(pulled.changed, ['API_KEY']);
  assert.equal(readEnv().API_KEY, 'theirs');
});

test('a key removed from the manifest is deleted from .env', async () => {
  writeSiteManifest({API_KEY: {updatedAt: 't1'}, OTHER: {updatedAt: 't1'}});
  gsmStore.set('site-a', {API_KEY: 'v1', OTHER: 'o1'});
  await syncSecrets({rootDir, apply: true});
  assert.equal(readEnv().API_KEY, 'v1');

  writeSiteManifest({OTHER: {updatedAt: 't1'}});
  const result = await syncSecrets({rootDir, apply: true});
  assert.deepEqual(result.removed, ['API_KEY']);
  assert.isUndefined(readEnv().API_KEY);
  assert.equal(readEnv().OTHER, 'o1');
  assert.isUndefined(readState().secrets.API_KEY);
});

test('unmanaged .env lines are always preserved', async () => {
  writeSiteManifest({API_KEY: {updatedAt: 't1'}});
  gsmStore.set('site-a', {API_KEY: 'v1'});
  fs.writeFileSync(path.join(rootDir, '.env'), '# header\nUNMANAGED=keep-me\n');

  await syncSecrets({rootDir, apply: true});
  const env = readEnv();
  assert.equal(env.UNMANAGED, 'keep-me');
  assert.equal(env.API_KEY, 'v1');
  assert.include(
    fs.readFileSync(path.join(rootDir, '.env'), 'utf8'),
    '# header'
  );
});

test('a shared-only site fetches only the imported gsmKey', async () => {
  // Shared manifest one level up.
  const shared = emptyManifest('proj', 'global');
  shared.secrets = {DATABASE_URL: {updatedAt: 's1'}};
  await writeManifest(
    path.join(rootDir, '..', `shared-${path.basename(rootDir)}.json`),
    shared
  );
  const sharedRel = `../shared-${path.basename(rootDir)}.json`;

  // Site with NO own secrets, importing the shared key.
  writeSiteManifest({}, {import: {manifest: sharedRel}});
  gsmStore.set('global', {DATABASE_URL: 'db1'});
  gsmStore.set('site-a', {SHOULD_NOT_FETCH: 'x'});

  const result = await syncSecrets({rootDir, apply: true});
  assert.deepEqual(result.changed, ['DATABASE_URL']);
  assert.equal(readEnv().DATABASE_URL, 'db1');
  // The site's own gsmKey is never fetched.
  assert.deepEqual(accessLog, ['global']);

  fs.rmSync(path.join(rootDir, '..', `shared-${path.basename(rootDir)}.json`), {
    force: true,
  });
});

test('a fetch failure is recorded, skipped, and retried next run', async () => {
  writeSiteManifest({API_KEY: {updatedAt: 't1'}});
  gsmStore.set('site-a', {API_KEY: 'v1'});
  gsmErrors.add('site-a');

  const failed = await syncSecrets({rootDir, apply: true});
  assert.equal(failed.errors.length, 1);
  assert.deepEqual(failed.changed, []);
  assert.isUndefined(readEnv().API_KEY);
  assert.isUndefined(readState().secrets.API_KEY); // state untouched -> will retry

  gsmErrors.clear();
  const ok = await syncSecrets({rootDir, apply: true});
  assert.deepEqual(ok.changed, ['API_KEY']);
  assert.equal(readEnv().API_KEY, 'v1');
});

test('apply:false computes a result without writing files', async () => {
  writeSiteManifest({API_KEY: {updatedAt: 't1'}});
  gsmStore.set('site-a', {API_KEY: 'v1'});

  const result = await syncSecrets({rootDir, apply: false});
  assert.deepEqual(result.changed, ['API_KEY']);
  assert.isFalse(fs.existsSync(path.join(rootDir, '.env')));
  assert.isFalse(fs.existsSync(localStatePath(rootDir)));
});

test('setSecret stores the value in GSM, the manifest, .env, and state', async () => {
  writeSiteManifest({});
  await setSecret({
    rootDir,
    manifestFilePath: manifestPath(rootDir),
    name: 'API_KEY',
    value: 'sekret',
    updatedBy: 'me@example.com',
  });

  assert.deepEqual(gsmStore.get('site-a'), {API_KEY: 'sekret'});
  assert.equal(readEnv().API_KEY, 'sekret');
  const manifest = await readManifest(manifestPath(rootDir));
  assert.equal(manifest!.secrets.API_KEY.updatedBy, 'me@example.com');
  assert.isString(manifest!.secrets.API_KEY.updatedAt);
  assert.equal(readState().secrets.API_KEY.hash.length, 64);
});

test('removeSecret clears the value from the manifest, GSM, .env, and state', async () => {
  writeSiteManifest({});
  await setSecret({
    rootDir,
    manifestFilePath: manifestPath(rootDir),
    name: 'API_KEY',
    value: 'sekret',
    updatedBy: 'me@example.com',
  });

  await removeSecret({
    rootDir,
    manifestFilePath: manifestPath(rootDir),
    name: 'API_KEY',
  });

  assert.deepEqual(gsmStore.get('site-a'), {});
  assert.isUndefined(readEnv().API_KEY);
  assert.isUndefined(readState().secrets.API_KEY);
  const manifest = await readManifest(manifestPath(rootDir));
  assert.isUndefined(manifest!.secrets.API_KEY);
});

test('getSecretsStatus reports per-key state without network', async () => {
  writeSiteManifest({API_KEY: {updatedAt: 't1'}});
  gsmStore.set('site-a', {API_KEY: 'v1'});
  await syncSecrets({rootDir, apply: true});

  accessLog.length = 0;
  const {keys} = await getSecretsStatus(rootDir);
  assert.deepEqual(accessLog, []); // no network
  assert.equal(keys.find((k) => k.name === 'API_KEY')!.kind, 'in-sync');
});

test('pushEnvToSecrets bulk-pushes all .env values, leaving them in-sync', async () => {
  writeSiteManifest({});
  fs.writeFileSync(
    path.join(rootDir, '.env'),
    'API_KEY=abc\nDB_URL=postgres://x\n'
  );

  const result = await pushEnvToSecrets({
    rootDir,
    manifestFilePath: manifestPath(rootDir),
    updatedBy: 'me@example.com',
  });

  assert.deepEqual([...result.pushed].sort(), ['API_KEY', 'DB_URL']);
  assert.deepEqual(gsmStore.get('site-a'), {
    API_KEY: 'abc',
    DB_URL: 'postgres://x',
  });
  const manifest = await readManifest(manifestPath(rootDir));
  assert.equal(manifest!.secrets.DB_URL.updatedBy, 'me@example.com');
  assert.equal(readState().secrets.API_KEY.hash.length, 64);
  // Everything is recorded as in-sync afterwards (no re-pull needed).
  const {keys} = await getSecretsStatus(rootDir);
  assert.isTrue(keys.every((k) => k.kind === 'in-sync'));
});

test('pushEnvToSecrets honors the keys allowlist and reports missing keys', async () => {
  writeSiteManifest({});
  fs.writeFileSync(path.join(rootDir, '.env'), 'API_KEY=abc\nIGNORED=nope\n');

  const result = await pushEnvToSecrets({
    rootDir,
    manifestFilePath: manifestPath(rootDir),
    only: ['API_KEY', 'MISSING'],
    updatedBy: 'me@example.com',
  });

  assert.deepEqual(result.pushed, ['API_KEY']);
  assert.deepEqual(result.skipped, [
    {name: 'MISSING', reason: 'not found in .env'},
  ]);
  assert.deepEqual(gsmStore.get('site-a'), {API_KEY: 'abc'});
});

test('pushEnvToSecrets skips keys provided by a shared manifest', async () => {
  const sharedPath = path.join(
    rootDir,
    '..',
    `shared-${path.basename(rootDir)}.json`
  );
  const shared = emptyManifest('proj', 'global');
  shared.secrets = {DATABASE_URL: {updatedAt: 's1'}};
  await writeManifest(sharedPath, shared);
  writeSiteManifest(
    {},
    {import: {manifest: `../shared-${path.basename(rootDir)}.json`}}
  );
  fs.writeFileSync(
    path.join(rootDir, '.env'),
    'API_KEY=abc\nDATABASE_URL=local\n'
  );

  const result = await pushEnvToSecrets({
    rootDir,
    manifestFilePath: manifestPath(rootDir),
    updatedBy: 'me@example.com',
  });

  assert.deepEqual(result.pushed, ['API_KEY']);
  assert.deepEqual(result.skipped, [
    {name: 'DATABASE_URL', reason: 'provided by shared manifest'},
  ]);
  assert.deepEqual(gsmStore.get('site-a'), {API_KEY: 'abc'});
  fs.rmSync(sharedPath, {force: true});
});

test('pushEnvToSecrets writes nothing when confirm declines', async () => {
  writeSiteManifest({});
  fs.writeFileSync(path.join(rootDir, '.env'), 'API_KEY=abc\n');

  const result = await pushEnvToSecrets({
    rootDir,
    manifestFilePath: manifestPath(rootDir),
    confirm: async () => false,
  });

  assert.isTrue(result.aborted);
  assert.deepEqual(result.pushed, []);
  assert.isUndefined(gsmStore.get('site-a'));
  assert.isFalse(fs.existsSync(localStatePath(rootDir)));
});
