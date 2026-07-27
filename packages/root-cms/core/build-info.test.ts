import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  clearBuildInfoCache,
  getBuildInfo,
  writeBuildInfo,
} from './build-info.js';

describe('build-info', () => {
  let rootDir: string;
  const nodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'root-cms-build-info-'));
    clearBuildInfoCache();
  });

  afterEach(() => {
    fs.rmSync(rootDir, {recursive: true, force: true});
    process.env.NODE_ENV = nodeEnv;
  });

  it('saves the build timestamp to dist/.root-cms/build.json', async () => {
    await writeBuildInfo(rootDir, {timestamp: 1700000000000});
    const filePath = path.join(rootDir, 'dist/.root-cms/build.json');
    expect(JSON.parse(fs.readFileSync(filePath, 'utf-8'))).toEqual({
      timestamp: 1700000000000,
    });
  });

  it('reads the build timestamp back', async () => {
    await writeBuildInfo(rootDir, {timestamp: 1700000000000});
    expect(await getBuildInfo(rootDir)).toEqual({timestamp: 1700000000000});
  });

  it('returns null when the app was not built', async () => {
    expect(await getBuildInfo(rootDir)).toBe(null);
  });

  it('returns null when the build file is malformed', async () => {
    const dir = path.join(rootDir, 'dist/.root-cms');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'build.json'), 'not json', 'utf-8');
    expect(await getBuildInfo(rootDir)).toBe(null);
  });

  it('returns null on the dev server', async () => {
    await writeBuildInfo(rootDir, {timestamp: 1700000000000});
    process.env.NODE_ENV = 'development';
    expect(await getBuildInfo(rootDir)).toBe(null);
  });
});
