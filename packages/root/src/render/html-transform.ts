import {RootConfig} from '../core/config.js';
import {htmlMinify} from './html-minify.js';
import {htmlPretty} from './html-pretty.js';

/**
 * Applies optional HTML post-processing (pretty-printing or minification) to
 * rendered HTML, based on the project's `root.config.ts`. Shared by both the SSR
 * render path and the SSG build so the two stay in sync.
 *
 * Behavior:
 * - When the built-in Root.js JSX renderer is enabled (`jsxRenderer.mode`), the
 *   renderer already controls output formatting, so `prettyHtml` and
 *   `minifyHtml` are ignored entirely and the html is returned unchanged.
 * - Otherwise (i.e. `preact-render-to-string`), formatting is strictly opt-in:
 *   `prettyHtml: true` pretty-prints via js-beautify, and `minifyHtml: true`
 *   minifies via html-minifier-terser. Neither runs by default.
 */
export async function transformHtml(
  html: string,
  rootConfig: RootConfig
): Promise<string> {
  if (rootConfig.jsxRenderer?.mode) {
    return html;
  }
  if (rootConfig.prettyHtml) {
    return htmlPretty(html, rootConfig.prettyHtmlOptions);
  }
  if (rootConfig.minifyHtml) {
    return htmlMinify(html, rootConfig.minifyHtmlOptions);
  }
  return html;
}
