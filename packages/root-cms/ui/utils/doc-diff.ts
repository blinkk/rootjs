/** Locales assumed for a doc without `sys.locales`, matching the server. */
const DEFAULT_LOCALES = ['en'];

/** Set-style diff of the `sys.locales` of two doc versions. */
export interface LocalesDiff {
  /** Locales present only in the right (newer) version. */
  added: string[];
  /** Locales present only in the left (older) version. */
  removed: string[];
  /** Locales present in both versions. */
  unchanged: string[];
}

interface DocWithSys {
  sys?: {locales?: string[]};
}

/**
 * Diffs the `sys.locales` of two doc versions, ignoring order. Returns `null`
 * when the locales are the same. A missing doc is treated as having no
 * locales.
 */
export function diffDocLocales(
  left: DocWithSys | null,
  right: DocWithSys | null
): LocalesDiff | null {
  const leftLocales = new Set(getLocales(left));
  const rightLocales = new Set(getLocales(right));
  const added = [...rightLocales].filter((l) => !leftLocales.has(l)).sort();
  const removed = [...leftLocales].filter((l) => !rightLocales.has(l)).sort();
  if (added.length === 0 && removed.length === 0) {
    return null;
  }
  const unchanged = [...leftLocales].filter((l) => rightLocales.has(l)).sort();
  return {added, removed, unchanged};
}

function getLocales(doc: DocWithSys | null): string[] {
  if (!doc) {
    return [];
  }
  return doc.sys?.locales || DEFAULT_LOCALES;
}
