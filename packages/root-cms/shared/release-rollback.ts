/**
 * Shared helpers for release rollbacks.
 *
 * When a release is published, the state that each item (doc, translations
 * locale doc, or data source) had immediately before the release is saved as
 * a "rollback snapshot" at:
 *
 * ```
 * /Projects/{p}/Releases/{releaseId}/RollbackSnapshots/{snapshotKey}
 * ```
 *
 * Each snapshot is written in the same write batch as the item's publish, so
 * a snapshot exists if and only if the release published the item. Rolling
 * back a release restores the snapshots.
 *
 * Each snapshot also records the `publishedAt` timestamp that the release
 * wrote to the item. Since the snapshot and the publish are committed
 * together, the timestamps are identical, so an item whose current
 * `publishedAt` differs from the snapshot's `releasedAt` has been published
 * (or unpublished) by someone else since the release.
 */

import {normalizeSlug} from './slug.js';

/** Name of the release subcollection that stores the rollback snapshots. */
export const RELEASE_ROLLBACK_SNAPSHOTS_COLLECTION = 'RollbackSnapshots';

export type ReleaseRollbackItemType = 'doc' | 'translations' | 'dataSource';

/** Minimal timestamp shape shared by the web and admin firestore SDKs. */
export interface TimestampLike {
  seconds: number;
  nanoseconds: number;
}

/**
 * The pre-release state of an item published by a release.
 */
export interface ReleaseRollbackSnapshot<T = any> {
  type: ReleaseRollbackItemType;
  /** The doc id, translations id, or data source id. */
  id: string;
  /** The locale of a translations locale doc. */
  locale?: string;
  /**
   * The `publishedAt` timestamp the release wrote to the item. Used to detect
   * whether the item has been published or unpublished since the release.
   */
  releasedAt: T;
  /**
   * The item's published data before the release, or `null` if the item
   * wasn't published. For docs, this is the `Published` doc. For translations,
   * the published locale doc. For data sources, the `Data/published` doc.
   */
  previous: Record<string, any> | null;
}

/**
 * Returns the snapshot doc key for an item, e.g. `doc:Pages--foo`,
 * `translations:Pages--foo:de` or `dataSource:products`.
 */
export function getReleaseRollbackSnapshotKey(
  type: ReleaseRollbackItemType,
  id: string,
  locale?: string
): string {
  if (type === 'translations') {
    return `translations:${normalizeSlug(id)}:${locale}`;
  }
  if (type === 'doc') {
    return `doc:${normalizeSlug(id)}`;
  }
  return `dataSource:${id}`;
}

/** Returns true if two firestore timestamps are exactly equal. */
export function testTimestampsEqual(
  a: TimestampLike | null | undefined,
  b: TimestampLike | null | undefined
): boolean {
  if (!a || !b) {
    return false;
  }
  return a.seconds === b.seconds && a.nanoseconds === b.nanoseconds;
}

/**
 * Returns the pre-release state to record for an item that a release is
 * about to publish.
 *
 * If the release already published the item (i.e. a "re-publish", or a retry
 * after a partially failed publish) and nobody has published the item since,
 * the original pre-release state is kept so that a rollback undoes the release
 * entirely. Otherwise the item's current published state is used.
 */
export function resolveReleaseRollbackPrevious(
  existing: ReleaseRollbackSnapshot | undefined,
  current: {data: Record<string, any> | null; publishedAt?: TimestampLike}
): Record<string, any> | null {
  if (
    existing &&
    testTimestampsEqual(current.publishedAt, existing.releasedAt)
  ) {
    return existing.previous ?? null;
  }
  return current.data ?? null;
}
