import {createRequire} from 'node:module';
import type {Options} from 'html-minifier-terser';

const require = createRequire(import.meta.url);

type MinifyFn = (value: string, options?: Options) => Promise<string>;
let cachedMinify: MinifyFn | null = null;

function getMinify(): MinifyFn {
  if (!cachedMinify) {
    cachedMinify = require('html-minifier-terser').minify;
  }
  return cachedMinify!;
}

export type HtmlMinifyOptions = Options;

export async function htmlMinify(
  html: string,
  options?: HtmlMinifyOptions
): Promise<string> {
  const minifyOptions = options || {
    collapseWhitespace: true,
    removeComments: true,
    preserveLineBreaks: true,
  };
  try {
    const minify = getMinify();
    const min = await minify(html, minifyOptions);
    return min.trimStart();
  } catch (e) {
    console.error('failed to minify html:', e);
    return html;
  }
}
