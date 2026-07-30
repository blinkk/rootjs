import {describe, expect, it} from 'vitest';
import {
  getUploadFiles,
  getUploadFilesFromDataTransfer,
  testIgnoredUploadDir,
  testIgnoredUploadFile,
} from './file-tree.js';

/** Builds a fake `File` with an optional directory-picker relative path. */
function testFile(name: string, webkitRelativePath?: string): File {
  return {name, webkitRelativePath: webkitRelativePath || ''} as any as File;
}

/** Builds a fake `FileSystemFileEntry`. */
function testFileEntry(name: string): FileSystemEntry {
  return {
    name,
    isFile: true,
    isDirectory: false,
    file: (cb: (file: File) => void) => cb(testFile(name)),
  } as any as FileSystemEntry;
}

/**
 * Builds a fake `FileSystemDirectoryEntry` whose reader returns its children
 * in batches of two (mirroring how browsers page `readEntries()`).
 */
function testDirEntry(
  name: string,
  children: FileSystemEntry[]
): FileSystemEntry {
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let i = 0;
      return {
        readEntries: (cb: (entries: FileSystemEntry[]) => void) => {
          const batch = children.slice(i, i + 2);
          i += batch.length;
          cb(batch);
        },
      };
    },
  } as any as FileSystemEntry;
}

/** Builds a fake `DataTransfer` for the given file system entries. */
function testDataTransfer(entries: FileSystemEntry[]): DataTransfer {
  return {
    items: entries.map((entry) => ({webkitGetAsEntry: () => entry})),
    files: [],
  } as any as DataTransfer;
}

describe('testIgnoredUploadFile', () => {
  it('ignores dotfiles and os metadata files', () => {
    expect(testIgnoredUploadFile('.DS_Store')).toBe(true);
    expect(testIgnoredUploadFile('.gitkeep')).toBe(true);
    expect(testIgnoredUploadFile('Thumbs.db')).toBe(true);
    expect(testIgnoredUploadFile('desktop.ini')).toBe(true);
  });

  it('keeps normal files', () => {
    expect(testIgnoredUploadFile('data.json')).toBe(false);
    expect(testIgnoredUploadFile('img_0.png')).toBe(false);
  });
});

describe('testIgnoredUploadDir', () => {
  it('ignores dot dirs and os metadata dirs', () => {
    expect(testIgnoredUploadDir('__MACOSX')).toBe(true);
    expect(testIgnoredUploadDir('.git')).toBe(true);
  });

  it('keeps normal dirs', () => {
    expect(testIgnoredUploadDir('images')).toBe(false);
  });
});

describe('getUploadFiles', () => {
  it('returns an empty list for no files', () => {
    expect(getUploadFiles(null)).toEqual([]);
    expect(getUploadFiles([])).toEqual([]);
  });

  it('uses an empty path for files without a relative path', () => {
    const res = getUploadFiles([testFile('hero.png')]);
    expect(res).toHaveLength(1);
    expect(res[0].path).toEqual('');
    expect(res[0].file.name).toEqual('hero.png');
  });

  it('preserves the folder structure of a directory picker', () => {
    const res = getUploadFiles([
      testFile('data.json', 'lottie/data.json'),
      testFile('img_0.png', 'lottie/images/img_0.png'),
    ]);
    expect(res.map((entry) => [entry.path, entry.file.name])).toEqual([
      ['lottie', 'data.json'],
      ['lottie/images', 'img_0.png'],
    ]);
  });

  it('skips ignored files and dirs', () => {
    const res = getUploadFiles([
      testFile('.DS_Store', 'lottie/.DS_Store'),
      testFile('data.json', 'lottie/__MACOSX/data.json'),
      testFile('img_0.png', 'lottie/images/img_0.png'),
    ]);
    expect(res.map((entry) => entry.file.name)).toEqual(['img_0.png']);
  });
});

describe('getUploadFilesFromDataTransfer', () => {
  it('returns an empty list without a data transfer', async () => {
    expect(await getUploadFilesFromDataTransfer(null)).toEqual([]);
  });

  it('walks dropped directories recursively', async () => {
    const dataTransfer = testDataTransfer([
      testFileEntry('hero.png'),
      testDirEntry('lottie', [
        testFileEntry('data.json'),
        testFileEntry('.DS_Store'),
        testDirEntry('images', [
          testFileEntry('img_0.png'),
          testFileEntry('img_1.png'),
          testFileEntry('img_2.png'),
        ]),
      ]),
    ]);
    const res = await getUploadFilesFromDataTransfer(dataTransfer);
    expect(res.map((entry) => [entry.path, entry.file.name])).toEqual([
      ['', 'hero.png'],
      ['lottie', 'data.json'],
      ['lottie/images', 'img_0.png'],
      ['lottie/images', 'img_1.png'],
      ['lottie/images', 'img_2.png'],
    ]);
  });

  it('falls back to the flat file list without entries support', async () => {
    const dataTransfer = {
      items: [{}],
      files: [testFile('hero.png')],
    } as any as DataTransfer;
    const res = await getUploadFilesFromDataTransfer(dataTransfer);
    expect(res.map((entry) => [entry.path, entry.file.name])).toEqual([
      ['', 'hero.png'],
    ]);
  });
});
