/** Preference value meaning no theme: the CMS's own, default look. */
export const NO_THEME = 'none';

/** Id of the `<link>` that loads the current theme's stylesheet. */
export const THEME_LINK_ID = 'root-cms-theme';

/**
 * The `localStorage` key that remembers a user's theme on this browser, so
 * the page can load it before the user's preferences arrive from Firestore.
 */
export function themeStorageKey(projectId: string): string {
  return `root-cms::${projectId}::theme`;
}
