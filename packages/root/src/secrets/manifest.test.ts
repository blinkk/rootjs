import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterEach, assert, beforeEach, test} from 'vitest';

import {
  emptyManifest,
  Manifest,
  manifestPath,
  readManifest,
  resolveManagedKeys,
  writeManifest,
} from './manifest.js';

let workdir: string;

beforeEach(() => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'root-manifest-'));
});

afterEach(() => {
  fs.rmSync(workdir, {recursive: true, force: true});
});

function siteDir(name: string): string {
  const dir = path.join(workdir, name);
  fs.mkdirSync(dir, {recursive: true});
  return dir;
}

async function write(dir: string, manifest: Manifest): Promise<void> {
  await writeManifest(manifestPath(dir), manifest);
}

test('resolveManagedKeys returns null when no manifest exists', async () => {
  assert.isNull(await resolveManagedKeys(siteDir('empty')));
});

test('resolveManagedKeys returns site keys', async () => {
  const dir = siteDir('site-a');
  const manifest = emptyManifest('proj', 'site-a');
  manifest.secrets = {API_KEY: {updatedAt: 't1'}};
  await write(dir, manifest);

  const resolved = await resolveManagedKeys(dir);
  assert.isNotNull(resolved);
  assert.deepEqual(resolved!.keys, [
    {name: 'API_KEY', gsmKey: 'site-a', gcpProjectId: 'proj', updatedAt: 't1'},
  ]);
});

test('resolveManagedKeys merges an imported subset', async () => {
  const shared = emptyManifest('proj', 'global');
  shared.secrets = {
    DATABASE_URL: {updatedAt: 's1'},
    UNUSED: {updatedAt: 's2'},
  };
  await writeManifest(path.join(workdir, manifestFilename()), shared);

  const dir = siteDir('site-a');
  const site = emptyManifest('proj', 'site-a');
  site.secrets = {API_KEY: {updatedAt: 't1'}};
  site.import = {manifest: '../.root.secrets.json', keys: ['DATABASE_URL']};
  await write(dir, site);

  const resolved = await resolveManagedKeys(dir);
  const names = resolved!.keys.map((k) => k.name).sort();
  assert.deepEqual(names, ['API_KEY', 'DATABASE_URL']);
  const dbKey = resolved!.keys.find((k) => k.name === 'DATABASE_URL')!;
  assert.equal(dbKey.gsmKey, 'global');
  assert.equal(dbKey.updatedAt, 's1');
});

test('resolveManagedKeys imports all shared keys when keys omitted', async () => {
  const shared = emptyManifest('proj', 'global');
  shared.secrets = {A: {updatedAt: 's1'}, B: {updatedAt: 's2'}};
  await writeManifest(path.join(workdir, manifestFilename()), shared);

  const dir = siteDir('site-a');
  const site = emptyManifest('proj', 'site-a');
  site.import = {manifest: '../.root.secrets.json'};
  await write(dir, site);

  const resolved = await resolveManagedKeys(dir);
  assert.deepEqual(resolved!.keys.map((k) => k.name).sort(), ['A', 'B']);
});

test('resolveManagedKeys rejects a name declared in both site and shared', async () => {
  const shared = emptyManifest('proj', 'global');
  shared.secrets = {DUP: {updatedAt: 's1'}};
  await writeManifest(path.join(workdir, manifestFilename()), shared);

  const dir = siteDir('site-a');
  const site = emptyManifest('proj', 'site-a');
  site.secrets = {DUP: {updatedAt: 't1'}};
  site.import = {manifest: '../.root.secrets.json'};
  await write(dir, site);

  await expectReject(resolveManagedKeys(dir), /declared in both/);
});

test('resolveManagedKeys rejects an unknown imported key', async () => {
  const shared = emptyManifest('proj', 'global');
  shared.secrets = {KNOWN: {updatedAt: 's1'}};
  await writeManifest(path.join(workdir, manifestFilename()), shared);

  const dir = siteDir('site-a');
  const site = emptyManifest('proj', 'site-a');
  site.import = {manifest: '../.root.secrets.json', keys: ['MISSING']};
  await write(dir, site);

  await expectReject(resolveManagedKeys(dir), /not defined/);
});

test('resolveManagedKeys rejects a shared manifest with a different project', async () => {
  const shared = emptyManifest('other-proj', 'global');
  shared.secrets = {A: {updatedAt: 's1'}};
  await writeManifest(path.join(workdir, manifestFilename()), shared);

  const dir = siteDir('site-a');
  const site = emptyManifest('proj', 'site-a');
  site.import = {manifest: '../.root.secrets.json'};
  await write(dir, site);

  await expectReject(resolveManagedKeys(dir), /gcpProjectId/);
});

test('readManifest rejects an invalid gsmKey', async () => {
  const dir = siteDir('bad');
  fs.writeFileSync(
    manifestPath(dir),
    JSON.stringify({gcpProjectId: 'p', gsmKey: 'bad key!', secrets: {}})
  );
  await expectReject(readManifest(manifestPath(dir)), /gsmKey/);
});

function manifestFilename(): string {
  return '.root.secrets.json';
}

async function expectReject(
  promise: Promise<unknown>,
  re: RegExp
): Promise<void> {
  let err: any;
  try {
    await promise;
  } catch (e) {
    err = e;
  }
  assert.isDefined(err, 'expected promise to reject');
  assert.match(String(err.message), re);
}
