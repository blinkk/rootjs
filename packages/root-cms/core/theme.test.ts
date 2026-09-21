import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  LoadedTheme,
  loadTheme,
  loadThemes,
  resolveDefaultTheme,
  themeUrl,
} from './theme.js';

describe('themeUrl', () => {
  it('maps an id to its stylesheet under /cms/themes', () => {
    expect(themeUrl('clarity')).toBe('/cms/themes/clarity.css');
    expect(themeUrl('my-theme-2')).toBe('/cms/themes/my-theme-2.css');
  });

  it('rejects ids that could leave the prefix', () => {
    expect(themeUrl('')).toBe(null);
    expect(themeUrl('../ui')).toBe(null);
    expect(themeUrl('clarity.css')).toBe(null);
    expect(themeUrl('Clarity')).toBe(null);
    expect(themeUrl('a b')).toBe(null);
  });
});

describe('loadTheme', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'root-cms-theme-'));
  });

  afterEach(() => {
    fs.rmSync(dir, {recursive: true, force: true});
    vi.restoreAllMocks();
  });

  it('reads the file relative to the project root', async () => {
    fs.writeFileSync(
      path.join(dir, 'abc.css'),
      '\n:root { --cms-drawer-radius: 6px; }\n'
    );
    const theme = await loadTheme({id: 'abc', file: './abc.css'}, dir);
    expect(theme).toEqual({
      id: 'abc',
      name: 'abc',
      css: ':root { --cms-drawer-radius: 6px; }',
      hash: expect.stringMatching(/^[0-9a-f]{8}$/),
    });
  });

  it('takes a name for the picker, and css after the file', async () => {
    fs.writeFileSync(path.join(dir, 'abc.css'), 'a {}\n');
    const theme = await loadTheme(
      {id: 'abc', name: 'Abc', file: 'abc.css', css: 'b {}'},
      dir
    );
    expect(theme?.name).toBe('Abc');
    expect(theme?.css).toBe('a {}\nb {}');
  });

  it('is null when there is nothing to load', async () => {
    expect(await loadTheme({id: 'abc'}, dir)).toBe(null);
    expect(await loadTheme({id: 'abc', css: ' \n'}, dir)).toBe(null);
  });

  it('warns about a bad id, once, and skips the theme', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await loadTheme({id: '../x', css: 'a {}'}, dir)).toBe(null);
    expect(await loadTheme({id: '../x', css: 'a {}'}, dir)).toBe(null);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('../x');
  });

  it('warns about a missing file, once, and carries on', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await loadTheme({id: 'abc', file: 'nope.css'}, dir)).toBe(null);
    expect(
      await loadTheme({id: 'abc', file: 'nope.css', css: 'b {}'}, dir)
    ).toEqual(expect.objectContaining({css: 'b {}'}));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('nope.css');
  });

  it('hashes the content', async () => {
    const a = await loadTheme({id: 'abc', css: 'a {}'}, dir);
    const b = await loadTheme({id: 'abc', css: 'b {}'}, dir);
    const again = await loadTheme({id: 'abc', css: 'a {}'}, dir);
    expect(a?.hash).not.toBe(b?.hash);
    expect(again?.hash).toBe(a?.hash);
  });
});

describe('loadThemes', () => {
  it('is empty when the project registered none', async () => {
    expect(await loadThemes(undefined, '/tmp')).toEqual([]);
    expect(await loadThemes([], '/tmp')).toEqual([]);
  });

  it('keeps config order and drops the unusable ones', async () => {
    const themes = await loadThemes(
      [{id: 'abc', css: 'a {}'}, {id: 'empty'}, {id: 'xyz', css: 'b {}'}],
      '/tmp'
    );
    expect(themes.map((theme) => theme.id)).toEqual(['abc', 'xyz']);
  });
});

describe('resolveDefaultTheme', () => {
  const themes = [
    {id: 'abc', name: 'Abc', css: 'a {}', hash: '00000000'},
    {id: 'xyz', name: 'Xyz', css: 'b {}', hash: '11111111'},
  ] as LoadedTheme[];

  it('is null when no default is configured', () => {
    expect(resolveDefaultTheme(themes, undefined)).toBe(null);
  });

  it('returns the named theme', () => {
    expect(resolveDefaultTheme(themes, 'xyz')?.id).toBe('xyz');
  });

  it('warns about, and ignores, a default that is not registered', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveDefaultTheme(themes, 'nope')).toBe(null);
    expect(warn).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
