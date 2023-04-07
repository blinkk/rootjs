import {promises as fs} from 'node:fs';
import path from 'node:path';
import fsExtra from 'fs-extra';
import glob from 'tiny-glob';

export function isJsFile(filename: string) {
  return !!filename.match(/\.(j|t)sx?$/);
}

export async function writeFile(filepath: string, content: string) {
  const dirPath = path.dirname(filepath);
  await makeDir(dirPath);
  await fs.writeFile(filepath, content);
}

export async function makeDir(dirpath: string) {
  try {
    await fs.access(dirpath);
  } catch (e) {
    await fs.mkdir(dirpath, {recursive: true});
  }
}

export async function copyDir(srcdir: string, dstdir: string) {
  if (!fsExtra.existsSync(srcdir)) {
    return;
  }
  fsExtra.copySync(srcdir, dstdir, {recursive: true, overwrite: true});
}

/**
 * Copies a glob of files from one directory to another.
 *
 * Example:
 *
 * ```
 * await copyGlob('*.css', 'src/styles', 'dist/html/styles');
 * ```
 */
export async function copyGlob(
  pattern: string,
  srcdir: string,
  dstdir: string
) {
  const files = await glob(pattern, {cwd: srcdir});
  if (files.length > 0) {
    await makeDir(dstdir);
  }
  files.forEach((file) => {
    fsExtra.copySync(path.resolve(srcdir, file), path.resolve(dstdir, file));
  });
}

export async function rmDir(dirpath: string) {
  await fs.rm(dirpath, {recursive: true, force: true});
}

export async function loadJson<T = unknown>(filepath: string): Promise<T> {
  const content = await fs.readFile(filepath, 'utf-8');
  return JSON.parse(content);
}

export async function isDirectory(dirpath: string) {
  return fs
    .stat(dirpath)
    .then((fsStat) => {
      return fsStat.isDirectory();
    })
    .catch((err) => {
      if (err.code === 'ENOENT') {
        return false;
      }
      throw err;
    });
}

export function fileExists(filepath: string): Promise<boolean> {
  return fs
    .access(filepath)
    .then(() => true)
    .catch(() => false);
}

export async function directoryContains(
  dirpath: string,
  subpath: string
): Promise<boolean> {
  const outer = await fs.realpath(dirpath);
  const inner = await fs.realpath(subpath);
  const rel = path.relative(outer, inner);
  return !rel.startsWith('..');
}