/**
 * The db-facing half of the doc editor's "follow mode", which switches the
 * editor to whatever CMS doc the preview pane navigates to.
 *
 * The url matching itself is pure and lives in `preview-doc-match.js`. This
 * module adds the parts that need the db (confirming a candidate doc actually
 * exists) plus a rate limit that disarms follow mode if a page bounces the
 * preview between docs.
 */

import {getDocFromCacheOrFetch} from './doc-cache.js';
import {PreviewDocCandidate} from './preview-doc-match.js';

/**
 * Max number of candidates probed per navigation. A catch-all collection
 * matches every url, so the candidate list grows with the number of
 * collections and locales; the ranking puts the plausible ones first.
 */
const MAX_PROBES = 6;

/** How long a "this doc doesn't exist" result is remembered. */
const MISS_TTL_MS = 60 * 1000;

/** Number of follows within {@link FOLLOW_WINDOW_MS} that trips the limiter. */
const FOLLOW_LIMIT = 5;

/** Sliding window used to detect a runaway follow loop. */
const FOLLOW_WINDOW_MS = 5000;

/**
 * Doc ids that were probed and found missing, with the time of the probe.
 * `getDocFromCacheOrFetch()` only caches hits, so without this every load of a
 * page that isn't a doc (a list page, a 404) re-reads every candidate.
 *
 * Module-level rather than a ref: the preview remounts on every follow, which
 * would reset a ref.
 */
const misses = new Map<string, number>();

/** Timestamps of recent follows, used by {@link testFollowRateLimit}. */
let recentFollows: number[] = [];

/** The doc a preview url resolved to. */
export interface FollowTarget {
  /** The doc to edit, e.g. "Pages/about". */
  docId: string;
  /** The locale to open the editor at, or an empty string for the default. */
  locale: string;
}

/**
 * Returns the highest-ranked candidate doc that actually exists, or `null`
 * when none of them do.
 *
 * The existence check isn't optional: a catch-all `/[...slug]` collection
 * matches every url, and the draft doc controller loads a missing doc as an
 * empty editor rather than erroring, so following an unverified candidate
 * would silently open a blank document.
 *
 * Candidates are probed in rank order and the first hit wins, so a well-ranked
 * match usually costs a single read.
 */
export async function resolveFollowTarget(
  candidates: PreviewDocCandidate[]
): Promise<FollowTarget | null> {
  for (const candidate of candidates.slice(0, MAX_PROBES)) {
    const docId = `${candidate.collectionId}/${candidate.slug}`;
    const missedAt = misses.get(docId);
    if (missedAt !== undefined) {
      if (Date.now() - missedAt < MISS_TTL_MS) {
        continue;
      }
      misses.delete(docId);
    }
    let data: any;
    try {
      data = await getDocFromCacheOrFetch(docId);
    } catch (err) {
      // A missing doc and a permission error both mean "don't follow".
      console.warn('follow mode: failed to load doc:', err);
      continue;
    }
    if (!data) {
      misses.set(docId, Date.now());
      continue;
    }
    // Only carry the url's locale over when the doc actually has it. The
    // editor's locale select would otherwise show a value that isn't one of
    // its options, and reloading the preview would navigate to a localized url
    // the server doesn't serve.
    const docLocales: string[] = data.sys?.locales || [];
    const locale =
      candidate.locale && docLocales.includes(candidate.locale)
        ? candidate.locale
        : '';
    return {docId: docId, locale: locale};
  }
  return null;
}

/**
 * Records a follow and returns whether follow mode should stay on. A page that
 * redirects the preview to another doc would otherwise bounce the editor back
 * and forth indefinitely, so a burst of follows disarms the mode.
 */
export function testFollowRateLimit(): boolean {
  const now = Date.now();
  recentFollows = recentFollows.filter((time) => now - time < FOLLOW_WINDOW_MS);
  recentFollows.push(now);
  return recentFollows.length <= FOLLOW_LIMIT;
}

/** Clears the follow rate limiter, e.g. when follow mode is switched back on. */
export function resetFollowRateLimit() {
  recentFollows = [];
}
