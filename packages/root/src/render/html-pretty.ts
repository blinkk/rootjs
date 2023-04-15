import {createRequire} from 'module';

const require = createRequire(import.meta.url);
import type {HTMLBeautifyOptions} from 'js-beautify';

const beautify = require('js-beautify');

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
    const output = beautify.html(html, prettyOptions);
    return output.trimStart();
  } catch (e) {
    console.error('failed to pretty html:', e);
    return html;
  }
}
