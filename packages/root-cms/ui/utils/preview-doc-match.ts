/**
 * Maps a preview pane url back to the CMS doc(s) that could be serving it.
 *
 * Used by the doc editor's "follow mode": when the user clicks a link inside
 * the preview, the editor switches to the doc behind the page they landed on.
 *
 * The forward mapping in `doc-urls.ts` is lossy -- a slug's `--` separators
 * become slashes, `/index` collapses to `/`, repeated slashes collapse -- so
 * this can't be a true inverse. Instead, slugs are extracted loosely from the
 * url and then confirmed by running the real forward functions and requiring
 * an exact match, which keeps the matcher bug-compatible with the forward path
 * by construction.
 *
 * The result is a ranked list rather than a single doc because a catch-all
 * collection (`/[...slug]`) matches every url, so several collections can
 * legitimately claim the same path. Callers must confirm that a candidate doc
 * actually exists before using it.
 *
 * The url math lives here so it can be unit tested without a live iframe or a
 * db connection.
 */

import {normalizeSlug} from '../../shared/slug.js';
import {
  formatUrlPath,
  getDocPreviewPath,
  getDocServingPath,
  normalizeUrlPath,
} from './doc-urls.js';

/**
 * Matches the slug placeholder in a collection's `url`/`previewUrl` pattern.
 * Kept identical to the pattern used by `getDocServingPath()` and
 * `getDocPreviewPath()` so the match lines up with what the forward path
 * actually substituted.
 */
const SLUG_PLACEHOLDER = /\[.*slug\]/;

/** Value substituted for `[path]` when deriving a url format's prefix. */
const PATH_SENTINEL = '__rootpreviewpath__';

/** A document whose url could produce a given preview path. */
export interface PreviewDocCandidate {
  collectionId: string;
  slug: string;
  /** The locale the url serves, or an empty string for the default locale. */
  locale: string;
  /** Literal path segments before the slug placeholder; higher is more specific. */
  specificity: number;
  /** Number of slug segments captured from the url; lower is more specific. */
  segments: number;
}

/** A slug extracted from a url, before it has been verified. */
interface SlugCandidate {
  slug: string;
  specificity: number;
  segments: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns the literal url prefix that precedes `[path]` for a given locale
 * (e.g. `/` for the default locale, or `/intl/de/foo/` for a project with a
 * base path and a custom `i18n.urlFormat`), or `null` when the format has no
 * `[path]` placeholder.
 *
 * The prefix is derived by calling the same formatter the forward path uses,
 * with a sentinel standing in for the doc's path. This avoids re-implementing
 * the placeholder substitution and works for formats that omit `[base]`.
 */
function getUrlFormatPrefix(locale: string): string | null {
  const rootConfig = window.__ROOT_CTX.rootConfig;
  let urlFormat = '/[base]/[path]';
  if (locale) {
    urlFormat = rootConfig.i18n?.urlFormat || '/[locale]/[base]/[path]';
  }
  let formatted: string;
  try {
    formatted = formatUrlPath(urlFormat, {
      base: rootConfig.base || '/',
      path: PATH_SENTINEL,
      locale: locale,
      slug: '',
    });
  } catch {
    return null;
  }
  const index = formatted.indexOf(PATH_SENTINEL);
  if (index < 0) {
    return null;
  }
  return formatted.slice(0, index);
}

/**
 * Returns `path` with the url format's `prefix` removed, or `null` when the
 * path isn't under that prefix. The prefix always ends in a slash, so the
 * prefix's own root (e.g. `/foo` for a base of `/foo/` on a site without
 * trailing slashes) is matched separately.
 */
function getRelativePath(prefix: string, path: string): string | null {
  if (path.startsWith(prefix)) {
    return `/${path.slice(prefix.length)}`.replace(/\/+/g, '/');
  }
  if (prefix.endsWith('/') && path === prefix.slice(0, -1)) {
    return '/';
  }
  return null;
}

/**
 * Extracts the slugs a url path could have come from, given a collection's
 * `url`/`previewUrl` pattern.
 *
 * The capture spans `/` because `[slug]` and `[...slug]` behave identically in
 * the forward direction: the placeholder is substituted first and the slug's
 * `--` separators are turned into slashes afterwards, so a `[slug]` collection
 * can serve a multi-segment path too. Both a greedy and a lazy capture are
 * tried, since a pattern with a literal suffix can match in more than one
 * place.
 */
function getSlugCandidates(
  pattern: string,
  relativePath: string
): SlugCandidate[] {
  const match = pattern.match(SLUG_PLACEHOLDER);
  if (!match || match.index === undefined) {
    // The collection serves every doc from one fixed path, so the slug can't
    // be recovered from the url.
    return [];
  }
  const literalPrefix = pattern.slice(0, match.index).replaceAll('--', '/');
  const literalSuffix = pattern
    .slice(match.index + match[0].length)
    .replaceAll('--', '/');
  const specificity = literalPrefix.split('/').filter(Boolean).length;
  // Repeated slashes collapse on the forward path, so any slash in the pattern
  // matches one or more slashes in the url.
  const prefixRe = escapeRegExp(literalPrefix).replaceAll('/', '/+');
  const suffixRe = escapeRegExp(literalSuffix).replaceAll('/', '/+');
  // A pattern's slash before the placeholder becomes `/+`, which needs a slash
  // to consume. `normalizeUrlPath()` strips the trailing slash when the project
  // doesn't use them, so match against a slash-terminated copy: without it a
  // prefixed collection's root (e.g. `/blog` for `/blog/[slug]`) never matches
  // its own `index` doc, and neither does a pattern whose literal suffix ends
  // in a slash.
  const probePath = relativePath.endsWith('/')
    ? relativePath
    : `${relativePath}/`;
  const candidates: SlugCandidate[] = [];
  const seen = new Set<string>();
  const addSlug = (slug: string, segments: number) => {
    if (!slug || seen.has(slug)) {
      return;
    }
    seen.add(slug);
    candidates.push({slug, specificity, segments});
  };
  for (const capture of ['(.*)', '(.*?)']) {
    const captured = probePath.match(
      new RegExp(`^${prefixRe}${capture}${suffixRe}/?$`)
    );
    if (!captured) {
      continue;
    }
    const slug = normalizeSlug(captured[1]);
    if (!slug) {
      continue;
    }
    const segments = slug.split('--').length;
    addSlug(slug, segments);
    // A doc named `about--index` also serves `/about/`, so offer it too. It's
    // ranked below the plain slug, which is the far more common shape.
    addSlug(`${slug}--index`, segments + 1);
  }
  // The forward path renames `/index` to `/`, so the pattern's bare literal
  // path is served by the slug `index`.
  if (new RegExp(`^${prefixRe}${suffixRe}/?$`).test(probePath)) {
    addSlug('index', 1);
  }
  return candidates;
}

/**
 * Returns whether a doc's forward-mapped url matches `path`. Both the preview
 * url and the serving url are accepted: the preview pane's own src is in
 * preview space, but links rendered by the previewed site are in serving
 * space.
 */
function testDocPathMatches(
  collectionId: string,
  slug: string,
  locale: string,
  path: string
): boolean {
  try {
    const options = {collectionId, slug, locale};
    return (
      getDocPreviewPath(options) === path || getDocServingPath(options) === path
    );
  } catch {
    return false;
  }
}

/**
 * Returns the documents whose preview or serving url could produce `pathname`,
 * ranked most-specific first. Returns an empty array for paths that can't be a
 * CMS doc (static assets, the CMS itself, urls outside the project's base
 * path).
 *
 * Usage:
 * ```
 * const candidates = getPreviewDocCandidates('/blog/my-post/');
 * // => [{collectionId: 'BlogPosts', slug: 'my-post', locale: '', ...}, ...]
 * ```
 */
export function getPreviewDocCandidates(
  pathname: string
): PreviewDocCandidate[] {
  const rootCtx = window.__ROOT_CTX;
  const rootConfig = rootCtx?.rootConfig;
  const collections = rootCtx?.collections;
  if (!rootConfig || !collections || !pathname || !pathname.startsWith('/')) {
    return [];
  }
  // Anything with a file extension is a static asset, never a doc. Mirrors the
  // check the server uses to 404 asset-like slugs.
  if (/\.[a-z0-9]+$/i.test(pathname)) {
    return [];
  }
  const path = normalizeUrlPath(pathname, {
    trailingSlash: rootConfig.server?.trailingSlash,
  });
  // The pane lands on the CMS itself when the preview session expires.
  const cmsPath = normalizeUrlPath(`${rootConfig.base || '/'}/cms`, {
    trailingSlash: false,
  });
  if (path === cmsPath || path.startsWith(`${cmsPath}/`)) {
    return [];
  }
  // Sorted for a deterministic tiebreak between equally-specific collections.
  const collectionIds = Object.keys(collections).sort();
  // The default locale's urls carry no locale prefix, so try it first --
  // otherwise a localized url format would happily eat a real path segment.
  const locales = ['', ...(rootConfig.i18n?.locales || [])];
  const candidates: PreviewDocCandidate[] = [];
  const seen = new Set<string>();
  for (const locale of locales) {
    const prefix = getUrlFormatPrefix(locale);
    if (prefix === null) {
      continue;
    }
    const relativePath = getRelativePath(prefix, path);
    if (relativePath === null) {
      continue;
    }
    for (const collectionId of collectionIds) {
      const collection = collections[collectionId];
      // Collections without a `url` don't serve a page at all.
      if (!collection?.url) {
        continue;
      }
      const patterns = [
        collection.previewUrl || collection.url,
        collection.url,
      ];
      for (const pattern of patterns) {
        for (const candidate of getSlugCandidates(pattern, relativePath)) {
          const key = `${collectionId}/${candidate.slug}|${locale}`;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          if (!testDocPathMatches(collectionId, candidate.slug, locale, path)) {
            continue;
          }
          candidates.push({
            collectionId: collectionId,
            slug: candidate.slug,
            locale: locale,
            specificity: candidate.specificity,
            segments: candidate.segments,
          });
        }
      }
    }
  }
  candidates.sort(
    (a, b) =>
      b.specificity - a.specificity ||
      a.segments - b.segments ||
      a.collectionId.localeCompare(b.collectionId)
  );
  return candidates;
}
