import fs from 'node:fs/promises';

/**
 * Resolves the `theme` plugin option into what the editor page loads: an
 * optional built-in theme stylesheet, then optional inline CSS on top.
 *
 * The option is the project's default. Each user can pick a different
 * built-in theme (or none) under Settings → User Preferences; the client
 * swaps the theme stylesheet accordingly, while the project's inline CSS
 * always applies.
 */

/** Themes ship as `ui/themes/<name>.css` and are served from this prefix. */
const THEME_URL_PREFIX = '/cms/static/themes/';

/**
 * Theme names are file names, so they are limited to what can never leave the
 * themes directory or need escaping in a URL.
 */
const THEME_NAME_PATTERN = /^[a-z0-9-]+$/;

/** A project theme: a built-in to start from, CSS to add, or both. */
export interface CMSTheme {
  /** Name of a built-in theme to load first. Omit to start from scratch. */
  extends?: string;
  /** CSS inlined after the built-in theme (and after the base stylesheet). */
  css?: string;
}

export interface ResolvedEditorTheme {
  /** The built-in theme's name, or `null` when none applies. */
  name: string | null;
  /** URL of the built-in theme stylesheet, or `null` when none applies. */
  stylesheetUrl: string | null;
  /** CSS to inline, already made safe for a `<style>` element. */
  inlineCss: string | null;
  /** Set when part of the option was ignored; worth logging. */
  warning?: string;
}

/**
 * The stylesheet URL for a named theme, or `null` when the name is not one a
 * theme file could have (so a typo or a path never reaches the static server).
 */
export function themeStylesheetUrl(theme: string | undefined): string | null {
  if (!theme || !THEME_NAME_PATTERN.test(theme)) {
    return null;
  }
  return `${THEME_URL_PREFIX}${theme}.css`;
}

/**
 * Makes a CSS string safe to inline in a `<style>` element. The HTML parser
 * ends a style element at the first `</style` it sees regardless of CSS
 * syntax, so a stylesheet containing that sequence (in a string or a comment)
 * would otherwise close the element early and leak the rest into the page as
 * markup. Escaping the slash keeps the CSS meaning (`<\/style` is still the
 * text `</style` to the CSS parser) while hiding the end tag from HTML.
 */
export function escapeInlineCss(css: string): string {
  return css.replace(/<\/(style)/gi, '<\\/$1');
}

export function resolveEditorTheme(
  option: string | CMSTheme | undefined
): ResolvedEditorTheme {
  const theme: CMSTheme =
    typeof option === 'string' ? {extends: option} : option || {};
  const stylesheetUrl = themeStylesheetUrl(theme.extends);
  const result: ResolvedEditorTheme = {
    name: stylesheetUrl ? theme.extends! : null,
    stylesheetUrl,
    inlineCss: theme.css ? escapeInlineCss(theme.css) : null,
  };
  if (theme.extends && !stylesheetUrl) {
    result.warning = `ignoring theme "${theme.extends}": theme names use lowercase letters, digits and hyphens`;
  }
  return result;
}

/**
 * The names of the built-in themes shipped in `themesDir` (the `ui/themes`
 * folder of the built package): every `<name>.css` whose name is one the
 * option would accept. Missing folder means no themes.
 */
export async function listBuiltInThemes(themesDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(themesDir);
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.endsWith('.css'))
    .map((entry) => entry.slice(0, -'.css'.length))
    .filter((name) => THEME_NAME_PATTERN.test(name))
    .sort();
}
