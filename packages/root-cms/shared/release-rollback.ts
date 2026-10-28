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
 *
 * The snapshot doc stores the item's previous data at its top level (with the
 * snapshot's metadata in a `_rollback` field) rather than nested in a field,
 * so that the snapshot is no deeper than the item itself. Firestore limits
 * maps and arrays to 20 levels of nesting, so nesting the previous data would
 * fail to publish items that are already at the limit. Use
 * `encodeReleaseRollbackSnapshot()` and `decodeReleaseRollbackSnapshot()` to
 * convert to and from the stored format.
 */

import {normalizeSlug} from './slug.js';

/** Name of the release subcollection that stores the rollback snapshots. */
export const RELEASE_ROLLBACK_SNAPSHOTS_COLLECTION = 'RollbackSnapshots';

export type ReleaseRollbackItemType = 'doc' | 'translations' | 'dataSource';

/** Field that holds a snapshot's metadata in the stored snapshot doc. */
const SNAPSHOT_METADATA_FIELD = '_rollback';

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

/**
 * Converts a snapshot to the format stored in the db. The previous data's
 * fields are stored at the top level of the snapshot doc, e.g.:
 *
 * ```
 * encodeReleaseRollbackSnapshot({type: 'doc', id, releasedAt, previous});
 * // => {...previous, _rollback: {type: 'doc', id, releasedAt, hasPrevious: true}}
 * ```
 */
export function encodeReleaseRollbackSnapshot<T>(
  snapshot: ReleaseRollbackSnapshot<T>
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    type: snapshot.type,
    id: snapshot.id,
    releasedAt: snapshot.releasedAt,
    hasPrevious: snapshot.previous !== null,
  };
  if (snapshot.locale) {
    metadata.locale = snapshot.locale;
  }
  return {...(snapshot.previous || {}), [SNAPSHOT_METADATA_FIELD]: metadata};
}

/**
 * Converts a snapshot doc from the db. Also reads snapshots recorded in the
 * original format, which nested the previous data in a `previous` field.
 */
export function decodeReleaseRollbackSnapshot<T = any>(
  data: Record<string, any>
): ReleaseRollbackSnapshot<T> {
  const {[SNAPSHOT_METADATA_FIELD]: metadata, ...previous} = data;
  if (!metadata) {
    return data as ReleaseRollbackSnapshot<T>;
  }
  const snapshot: ReleaseRollbackSnapshot<T> = {
    type: metadata.type,
    id: metadata.id,
    releasedAt: metadata.releasedAt,
    previous: metadata.hasPrevious ? previous : null,
  };
  if (metadata.locale) {
    snapshot.locale = metadata.locale;
  }
  return snapshot;
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
