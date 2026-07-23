import {describe, expect, it} from 'vitest';
import {
  buildUniqueAssetName,
  isIgnoredSourceFile,
  sanitizeAssetName,
} from './names.js';

describe('sanitizeAssetName', () => {
  it('replaces slashes with dashes', () => {
    expect(sanitizeAssetName('icon/24/arrow')).toEqual('icon-24-arrow');
    expect(sanitizeAssetName('a\\b')).toEqual('a-b');
  });

  it('collapses whitespace and trims', () => {
    expect(sanitizeAssetName('  hero   image  ')).toEqual('hero image');
  });

  it('falls back for empty/dot names', () => {
    expect(sanitizeAssetName('')).toEqual('untitled');
    expect(sanitizeAssetName('   ')).toEqual('untitled');
    expect(sanitizeAssetName('.')).toEqual('untitled');
    expect(sanitizeAssetName('..')).toEqual('untitled');
  });

  it('strips control characters', () => {
    expect(sanitizeAssetName('a\u0000b')).toEqual('a-b');
  });

  it('truncates very long names', () => {
    const long = 'a'.repeat(500);
    expect(sanitizeAssetName(long).length).toBeLessThanOrEqual(190);
  });
});

describe('isIgnoredSourceFile', () => {
  it('ignores hidden dotfiles', () => {
    expect(isIgnoredSourceFile('.DS_Store')).toBe(true);
    expect(isIgnoredSourceFile('.ds_store')).toBe(true);
    expect(isIgnoredSourceFile('._hero.png')).toBe(true);
    expect(isIgnoredSourceFile('.localized')).toBe(true);
    expect(isIgnoredSourceFile('.~lock.report.odt#')).toBe(true);
    expect(isIgnoredSourceFile('.gitignore')).toBe(true);
  });

  it('ignores well-known OS artifacts case-insensitively', () => {
    expect(isIgnoredSourceFile('Thumbs.db')).toBe(true);
    expect(isIgnoredSourceFile('thumbs.db')).toBe(true);
    expect(isIgnoredSourceFile('ehthumbs.db')).toBe(true);
    expect(isIgnoredSourceFile('ehthumbs_vista.db')).toBe(true);
    expect(isIgnoredSourceFile('Desktop.ini')).toBe(true);
    expect(isIgnoredSourceFile('Icon\r')).toBe(true);
    expect(isIgnoredSourceFile('__MACOSX')).toBe(true);
  });

  it('ignores tooling temp files', () => {
    expect(isIgnoredSourceFile('~$Report.docx')).toBe(true);
    expect(isIgnoredSourceFile('photo.jpg.crdownload')).toBe(true);
  });

  it('keeps regular asset names', () => {
    expect(isIgnoredSourceFile('hero.png')).toBe(false);
    expect(isIgnoredSourceFile('my.file.png')).toBe(false);
    expect(isIgnoredSourceFile('Iconography.svg')).toBe(false);
    expect(isIgnoredSourceFile('Icons.zip')).toBe(false);
    expect(isIgnoredSourceFile('report.docx')).toBe(false);
    expect(isIgnoredSourceFile('archive.tar.gz')).toBe(false);
    expect(isIgnoredSourceFile('')).toBe(false);
  });
});

describe('buildUniqueAssetName', () => {
  it('returns the name unchanged when unused', () => {
    const used = new Set<string>();
    expect(buildUniqueAssetName('icon.png', used)).toEqual('icon.png');
    expect(used.has('icon.png')).toBe(true);
  });

  it('adds a counter before the extension on collision', () => {
    const used = new Set(['icon.png']);
    expect(buildUniqueAssetName('icon.png', used)).toEqual('icon (2).png');
    expect(buildUniqueAssetName('icon.png', used)).toEqual('icon (3).png');
  });

  it('matches collisions case-insensitively', () => {
    const used = new Set(['icon.png']);
    expect(buildUniqueAssetName('Icon.png', used)).toEqual('Icon (2).png');
  });

  it('handles names without an extension', () => {
    const used = new Set(['readme']);
    expect(buildUniqueAssetName('readme', used)).toEqual('readme (2)');
  });
});
