import {createRequire} from 'node:module';
import type {HTMLBeautifyOptions} from 'js-beautify';

const require = createRequire(import.meta.url);

type BeautifyModule = {
  html: (source: string, options?: HTMLBeautifyOptions) => string;
};
let cachedBeautify: BeautifyModule | null = null;

function getBeautify(): BeautifyModule {
  if (!cachedBeautify) {
    cachedBeautify = require('js-beautify');
  }
  return cachedBeautify!;
}

export type HtmlPrettyOptions = HTMLBeautifyOptions;

export async function htmlPretty(
  html: string,
  options?: HtmlPrettyOptions
): Promise<string> {
  const prettyOptions = options || {
    indent_size: 0,
    end_with_newline: true,
    extra_liners: [],
  };
  try {
    const beautify = getBeautify();
    const output = beautify.html(html, prettyOptions);
    return output.trimStart();
  } catch (e) {
    console.error('failed to pretty html:', e);
    return html;
  }
}
