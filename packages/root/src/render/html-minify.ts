import {minify} from 'html-minifier-terser';

export async function htmlMinify(html: string): Promise<string> {
  const min = await minify(html, {
    collapseWhitespace: true,
    removeComments: true,
    preserveLineBreaks: true,
  });
  return min.trimStart();
}
