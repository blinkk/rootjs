/**
 * @fileoverview Hashes the screenshot scene sources, so the upload script can
 * tell when a rendered PNG is out of date with the code that produces it.
 */

import crypto from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';

/** Paths under `screenshots/` that aren't scene sources. */
const IGNORED = new Set(['.out', 'screenshots.json']);

async function listFiles(dir: string, root: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, {withFileTypes: true});
  for (const entry of entries) {
    if (IGNORED.has(entry.name)) {
      continue;
    }
    const filepath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(filepath, root)));
    } else {
      files.push(path.relative(root, filepath));
    }
  }
  return files;
}

/**
 * Returns a hash of every source file in the `screenshots/` dir (scenes, UI
 * kit, styles), ignoring rendered output.
 */
export async function hashScreenshotSources(screenshotsDir: string) {
  const files = (await listFiles(screenshotsDir, screenshotsDir)).sort();
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update(await readFile(path.join(screenshotsDir, file)));
  }
  return hash.digest('hex').slice(0, 16);
}
