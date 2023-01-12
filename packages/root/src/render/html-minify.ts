import {minify, Options} from 'html-minifier-terser';

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
    const min = await minify(html, minifyOptions);
    return min.trimStart();
  } catch (e) {
    console.error('failed to minify html:', e);
    return html;
  }
}
