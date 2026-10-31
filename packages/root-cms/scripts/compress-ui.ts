/**
 * Precompresses the built CMS UI with max-quality brotli, which is too slow to
 * run per request. The server's static middleware serves the `.br` files.
 *
 * Usage: node scripts/compress-ui.ts
 */

import {readdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import zlib from 'node:zlib';

const UI_DIR = path.resolve(import.meta.dirname, '../dist/ui');

/** Files smaller than this aren't worth a request-time lookup or the disk. */
const MIN_SIZE_BYTES = 1024;

const brotliCompress = promisify(zlib.brotliCompress);

async function compressFile(filepath: string): Promise<boolean> {
  const content = await readFile(filepath);
  if (content.length < MIN_SIZE_BYTES) {
    return false;
  }
  const compressed = await brotliCompress(content, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: content.length,
    },
  });
  await writeFile(`${filepath}.br`, compressed);
  return true;
}

const files = (await readdir(UI_DIR)).filter((file) =>
  /\.(?:css|js)$/.test(file)
);
const results = await Promise.all(
  files.map((file) => compressFile(path.join(UI_DIR, file)))
);
console.log(`compressed ${results.filter(Boolean).length} ui files`);
