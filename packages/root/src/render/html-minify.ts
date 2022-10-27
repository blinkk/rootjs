import {minify} from 'html-minifier-terser';

export async function htmlMinify(html: string): Promise<string> {
  try {
    const min = await minify(html, {
      collapseWhitespace: true,
      removeComments: true,
      preserveLineBreaks: true,
    });
    return min.trimStart();
  } catch (e) {
    console.error('failed to minify html:', e);
    return html;
  }
}
