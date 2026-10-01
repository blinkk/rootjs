// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {collectUploadItems} from './assets.js';

describe('collectUploadItems', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'root-cms-assets-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, {recursive: true, force: true});
  });

  function touch(relPath: string) {
    const filePath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, 'x');
    return filePath;
  }

  it('uploads files into the destination folder', () => {
    const hero = touch('hero.png');
    expect(collectUploadItems([hero], 'marketing')).toEqual([
      {filePath: hero, folder: 'marketing'},
    ]);
    expect(collectUploadItems([hero], '')).toEqual([
      {filePath: hero, folder: ''},
    ]);
  });

  it('mirrors directory structure as subfolders', () => {
    const a = touch('icons/a.svg');
    const b = touch('icons/social/b.svg');
    touch('icons/.DS_Store');
    touch('icons/.hidden/c.svg');
    expect(collectUploadItems([path.join(tmpDir, 'icons')], 'brand/')).toEqual([
      {filePath: a, folder: 'brand/icons'},
      {filePath: b, folder: 'brand/icons/social'},
    ]);
    expect(collectUploadItems([path.join(tmpDir, 'icons')], '')).toEqual([
      {filePath: a, folder: 'icons'},
      {filePath: b, folder: 'icons/social'},
    ]);
  });

  it('throws for missing paths', () => {
    expect(() =>
      collectUploadItems([path.join(tmpDir, 'missing.png')], '')
    ).toThrow('file not found');
  });
});
