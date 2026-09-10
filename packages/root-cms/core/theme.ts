import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * A theme for the CMS UI: a stylesheet loaded after the CMS's own, styling
 * whatever the CSS reaches. Themes are registered by the project (a plugin
 * or a package can export one); each user chooses which of them to use.
 */
export interface CMSTheme {
  /** Identifies the theme in config, in the URL and in a user's preference. */
  id: string;
  /** Shown in the theme picker. Defaults to the id. */
  name?: string;
  /** Path to a CSS file, relative to the project root (`root.config.ts`). */
  file?: string;
  /** CSS appended after the file, or the whole theme on its own. */
  css?: string;
}

/** A theme with its stylesheet read and hashed. */
export interface LoadedTheme {
  id: string;
  name: string;
  css: string;
  /** Hash of `css`, to cache-bust the stylesheet URL. */
  hash: string;
}

/** Themes are served under this prefix, behind the CMS's login. */
export const THEMES_URL_PREFIX = '/cms/themes/';

/**
 * Theme ids appear in a URL path, so they are limited to what can never
 * leave the prefix or need escaping.
 */
const THEME_ID_PATTERN = /^[a-z0-9-]+$/;

/** The stylesheet URL for a theme id, or `null` when the id is not valid. */
export function themeUrl(id: string): string | null {
  if (!id || !THEME_ID_PATTERN.test(id)) {
    return null;
  }
  return `${THEMES_URL_PREFIX}${id}.css`;
}

/** Problems already reported, so a bad theme is logged once, not per render. */
const warned = new Set<string>();

function warnOnce(key: string, message: string) {
  if (!warned.has(key)) {
    warned.add(key);
    console.warn(`[root-cms] ${message}`);
  }
}

/**
 * Reads one theme's stylesheet: the file's contents, then `css`. `null` when
 * the theme is unusable (bad id, or nothing to load). Read on every call, so
 * an edit to the file shows on the next reload; the served stylesheet is
 * cached by its content hash.
 */
export async function loadTheme(
  theme: CMSTheme,
  rootDir: string
): Promise<LoadedTheme | null> {
  if (!themeUrl(theme.id)) {
    warnOnce(
      `id:${theme.id}`,
      `ignoring theme "${theme.id}": ids use lowercase letters, digits and hyphens`
    );
    return null;
  }
  const parts: string[] = [];
  if (theme.file) {
    const filePath = path.resolve(rootDir, theme.file);
    try {
      parts.push(await fs.readFile(filePath, 'utf-8'));
    } catch {
      warnOnce(`file:${filePath}`, `theme file not found: ${filePath}`);
    }
  }
  if (theme.css) {
    parts.push(theme.css);
  }
  const css = parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n');
  if (!css) {
    return null;
  }
  return {
    id: theme.id,
    name: theme.name || theme.id,
    css,
    hash: crypto.createHash('sha1').update(css).digest('hex').slice(0, 8),
  };
}

/** Reads every usable theme the project registered, in config order. */
export async function loadThemes(
  themes: CMSTheme[] | undefined,
  rootDir: string
): Promise<LoadedTheme[]> {
  if (!themes?.length) {
    return [];
  }
  const loaded = await Promise.all(
    themes.map((theme) => loadTheme(theme, rootDir))
  );
  return loaded.filter((theme): theme is LoadedTheme => theme !== null);
}

/**
 * The theme that applies when a user hasn't chosen one: the configured
 * default, or nothing. A default naming a theme that isn't registered is
 * reported and ignored.
 */
export function resolveDefaultTheme(
  themes: LoadedTheme[],
  defaultTheme: string | undefined
): LoadedTheme | null {
  if (!defaultTheme) {
    return null;
  }
  const match = themes.find((theme) => theme.id === defaultTheme);
  if (!match) {
    warnOnce(
      `default:${defaultTheme}`,
      `defaultTheme "${defaultTheme}" is not one of the registered themes`
    );
    return null;
  }
  return match;
}
