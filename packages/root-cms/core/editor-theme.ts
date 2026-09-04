import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * A project theme for the CMS editor: a stylesheet loaded after the editor's
 * own, from a file in the project and/or a CSS string.
 */
export interface CMSTheme {
  /** Path to a CSS file, relative to the project root (`root.config.ts`). */
  file?: string;
  /** CSS appended after the file, e.g. a few property overrides. */
  css?: string;
}

/**
 * Where the project theme is served, behind the same login as the editor
 * page that links it.
 */
export const THEME_URL = '/cms/theme.css';

export interface EditorTheme {
  css: string;
  /** Hash of `css`, to cache-bust the stylesheet URL. */
  hash: string;
}

/** Files already warned about, so a missing file is reported once. */
const warnedFiles = new Set<string>();

/**
 * The project theme's CSS: the file's contents, then `css`. `null` when the
 * project has no theme. Read on every call, so an edit to the file shows on
 * the next reload; the served stylesheet is cached by its content hash.
 */
export async function loadEditorTheme(
  option: CMSTheme | undefined,
  rootDir: string
): Promise<EditorTheme | null> {
  if (!option) {
    return null;
  }
  const parts: string[] = [];
  if (option.file) {
    const filePath = path.resolve(rootDir, option.file);
    try {
      parts.push(await fs.readFile(filePath, 'utf-8'));
    } catch {
      if (!warnedFiles.has(filePath)) {
        warnedFiles.add(filePath);
        console.warn(`[root-cms] theme file not found: ${filePath}`);
      }
    }
  }
  if (option.css) {
    parts.push(option.css);
  }
  const css = parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n');
  if (!css) {
    return null;
  }
  const hash = crypto.createHash('sha1').update(css).digest('hex').slice(0, 8);
  return {css, hash};
}
