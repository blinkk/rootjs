import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {loadEditorTheme} from './editor-theme.js';

describe('loadEditorTheme', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'root-cms-theme-'));
  });

  afterEach(() => {
    fs.rmSync(dir, {recursive: true, force: true});
    vi.restoreAllMocks();
  });

  it('is null when the project has no theme', async () => {
    expect(await loadEditorTheme(undefined, dir)).toBe(null);
    expect(await loadEditorTheme({}, dir)).toBe(null);
    expect(await loadEditorTheme({css: ' \n'}, dir)).toBe(null);
  });

  it('reads the file relative to the project root', async () => {
    fs.writeFileSync(
      path.join(dir, 'cms-theme.css'),
      '\n:root { --cms-drawer-radius: 6px; }\n'
    );
    const theme = await loadEditorTheme({file: './cms-theme.css'}, dir);
    expect(theme?.css).toBe(':root { --cms-drawer-radius: 6px; }');
    expect(theme?.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('appends css after the file', async () => {
    fs.writeFileSync(path.join(dir, 'cms-theme.css'), 'a {}\n');
    const theme = await loadEditorTheme(
      {file: 'cms-theme.css', css: 'b {}'},
      dir
    );
    expect(theme?.css).toBe('a {}\nb {}');
  });

  it('takes css on its own', async () => {
    const theme = await loadEditorTheme({css: 'b {}'}, dir);
    expect(theme?.css).toBe('b {}');
  });

  it('warns about a missing file, once, and carries on', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await loadEditorTheme({file: 'missing.css'}, dir)).toBe(null);
    expect(
      await loadEditorTheme({file: 'missing.css', css: 'b {}'}, dir)
    ).toEqual(expect.objectContaining({css: 'b {}'}));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('missing.css');
  });

  it('hashes the content', async () => {
    const a = await loadEditorTheme({css: 'a {}'}, dir);
    const b = await loadEditorTheme({css: 'b {}'}, dir);
    const aAgain = await loadEditorTheme({css: 'a {}'}, dir);
    expect(a?.hash).not.toBe(b?.hash);
    expect(aAgain?.hash).toBe(a?.hash);
  });
});
