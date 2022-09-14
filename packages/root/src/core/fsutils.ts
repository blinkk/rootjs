import {promises as fs} from 'node:fs';
import path from 'node:path';
import fsExtra from 'fs-extra';

export function isJsFile(file: string) {
  return !!file.match(/\.(j|t)sx?$/);
}

export async function writeFile(filePath: string, content: string) {
  const dirPath = path.dirname(filePath);
  await makeDir(dirPath);
  await fs.writeFile(filePath, content);
}

export async function makeDir(dirPath: string) {
  try {
    await fs.access(dirPath);
  } catch (e) {
    await fs.mkdir(dirPath, {recursive: true});
  }
}

export async function copyDir(srcDir: string, dstDir: string) {
  if (!fsExtra.existsSync(srcDir)) {
    return;
  }
  fsExtra.copySync(srcDir, dstDir, {recursive: true, overwrite: true});
}

export async function rmDir(dirPath: string) {
  await fs.rm(dirPath, {recursive: true, force: true});
}

export async function loadJson(filePath: string): Promise<any> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

export async function isDirectory(dirPath: string) {
  return fs
    .stat(dirPath)
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

export function fileExists(filePath: string): Promise<boolean> {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}
