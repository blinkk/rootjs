/**
 * @fileoverview Filename helpers for assets imported from sync sources.
 *
 * Remote names (e.g. Figma layer names like `icon/24/arrow`) commonly
 * contain characters that are invalid in asset names (see
 * `validateAssetName()` in `ui/utils/assets.ts`), so they are sanitized
 * before being used, and collisions are de-duped with a ` (2)` counter.
 * Hidden files and OS artifacts (e.g. `.DS_Store`) are recognized by
 * `isIgnoredSourceFile()` and excluded from syncs by the engine.
 */

/** Mirrors the invalid chars rejected by `validateAssetName()`. */
// eslint-disable-next-line no-control-regex
const INVALID_NAME_CHARS_RE = /[/\\\u0000-\u001f]/g;

/**
 * Max length for generated names, kept below the asset library's 200-char
 * limit to leave room for de-dupe suffixes.
 */
const MAX_NAME_LENGTH = 190;

/**
 * Sanitizes a remote display name into a valid asset name: slashes and
 * control chars become `-`, whitespace is collapsed, and overly long names
 * are truncated.
 */
export function sanitizeAssetName(name: string): string {
  let result = String(name || '').replace(INVALID_NAME_CHARS_RE, '-');
  result = result.replace(/\s+/g, ' ').trim();
  if (!result || result === '.' || result === '..') {
    result = 'untitled';
  }
  if (result.length > MAX_NAME_LENGTH) {
    result = result.slice(0, MAX_NAME_LENGTH).trim();
  }
  return result;
}

/**
 * Well-known OS/tooling artifact filenames that are never intentional
 * assets. Compared case-insensitively against the remote name.
 */
const IGNORED_FILE_NAMES = new Set([
  // Windows Explorer / Media Center thumbnail caches and folder config.
  'thumbs.db',
  'ehthumbs.db',
  'ehthumbs_vista.db',
  'desktop.ini',
  // macOS custom folder icon resource (literally "Icon" + a carriage
  // return) and the resource-fork folder zip tools extract.
  'icon\r',
  '__macosx',
]);

/**
 * Returns true for remote file names that a sync should never import:
 * hidden dotfiles and well-known OS/tooling artifacts. Synced sources
 * commonly mirror someone's local disk (e.g. a Drive folder managed by
 * Drive for desktop), which litters them with files like `.DS_Store` that
 * are never intentional assets. The dot-prefix rule also matches design
 * tools' "hidden/private" naming conventions (e.g. Figma excludes
 * dot-prefixed components from publishing), so the engine applies this to
 * every provider.
 */
export function isIgnoredSourceFile(name: string): boolean {
  const normalized = String(name || '').toLowerCase();
  if (!normalized) {
    return false;
  }
  // Hidden files (.DS_Store, ._resource-forks, .localized, .~lock files,
  // sync-tool markers, ...).
  if (normalized.startsWith('.')) {
    return true;
  }
  // MS Office owner/lock temp files, e.g. `~$Report.docx`.
  if (normalized.startsWith('~$')) {
    return true;
  }
  // In-progress Chrome downloads.
  if (normalized.endsWith('.crdownload')) {
    return true;
  }
  return IGNORED_FILE_NAMES.has(normalized);
}

/**
 * Returns a name that doesn't collide with `usedNames` (a set of lowercased
 * names), inserting a ` (2)`-style counter before the extension if needed.
 * The returned name is added to `usedNames`.
 */
export function buildUniqueAssetName(
  name: string,
  usedNames: Set<string>
): string {
  const lower = name.toLowerCase();
  if (!usedNames.has(lower)) {
    usedNames.add(lower);
    return name;
  }
  const dotIndex = name.lastIndexOf('.');
  const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const ext = dotIndex > 0 ? name.slice(dotIndex) : '';
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!usedNames.has(candidate.toLowerCase())) {
      usedNames.add(candidate.toLowerCase());
      return candidate;
    }
  }
}
