/**
 * @fileoverview Helpers for reading `screenshots/screenshots.json` and turning
 * its entries into CMS image field values.
 */

import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {ScreenshotEntry, ScreenshotsMap} from '../screenshots/types.ts';

const DOCS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
export const SCREENSHOTS_PATH = path.join(
  DOCS_DIR,
  'screenshots/screenshots.json'
);

/** Reads `screenshots.json`, or returns an empty map if it doesn't exist. */
export async function readScreenshots(): Promise<ScreenshotsMap> {
  try {
    return JSON.parse(await readFile(SCREENSHOTS_PATH, 'utf8'));
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

/**
 * Returns the image field value for a screenshot, or undefined when it hasn't
 * been uploaded. The value links to the screenshot's asset library file (via
 * `assetId`), so re-uploading the screenshot updates every doc that uses it.
 */
export function screenshotImage(entry: ScreenshotEntry | undefined) {
  if (!entry) {
    return undefined;
  }
  return {
    src: entry.src,
    width: entry.width,
    height: entry.height,
    alt: entry.alt,
    gcsPath: entry.gcsPath,
    assetId: entry.assetId,
  };
}
