import {readFileSync} from 'node:fs';
import path from 'node:path';
import type {RootConfig} from '@blinkk/root';
import {parseProposal} from '@blinkk/root-cms';
import {
  RootCMSClient,
  type GetDocOptions,
  type ListDocsOptions,
  type LoadTranslationsOptions,
  type RootCMSClientOptions,
  type TranslationsMap,
} from '@blinkk/root-cms/client';

/** How long a cached published read is served before it's fetched again. */
const CACHE_TTL_MS = 60 * 1000;

/** Max number of cached reads, so arbitrary slugs can't grow it unbounded. */
const CACHE_MAX_ENTRIES = 1000;

export interface CreateCmsClientOptions {
  /**
   * Caches published reads in memory for a short time (see
   * `CachedRootCMSClient`). Only use the cached client for published (i.e.
   * non-preview) requests. Ignored outside of production.
   */
  cache?: boolean;
}

/**
 * Creates a `RootCMSClient`. When the `CMS_PROPOSAL` env var is set to the path
 * of a change proposal (e.g. `cms-proposals/<id>.yaml`), the proposal is
 * overlaid on every read, so it can be previewed before it's applied:
 *
 *   CMS_PROPOSAL=cms-proposals/<id>.yaml pnpm dev
 *
 * Nothing is written to the CMS. Only use this for local previews.
 */
export function createCmsClient(
  rootConfig: RootConfig,
  options?: CreateCmsClientOptions
) {
  const clientOptions: RootCMSClientOptions = {};
  const proposalPath = process.env.CMS_PROPOSAL;
  if (proposalPath) {
    const filePath = path.resolve(rootConfig.rootDir, proposalPath);
    const result = parseProposal(readFileSync(filePath, 'utf8'));
    if (!result.ok) {
      throw new Error(
        `invalid proposal ${proposalPath}: ${JSON.stringify(result.errors)}`
      );
    }
    console.log(`previewing proposal: ${proposalPath}`);
    clientOptions.proposal = result.proposal;
  }
  if (options?.cache && process.env.NODE_ENV === 'production') {
    return new CachedRootCMSClient(rootConfig, clientOptions);
  }
  return new RootCMSClient(rootConfig, clientOptions);
}

interface CacheEntry {
  expiresAt: number;
  value: Promise<any>;
}

/** Cached reads, shared by every `CachedRootCMSClient` in the process. */
const cache = new Map<string, CacheEntry>();

/**
 * Returns the cached value for `key`, or calls `fetch()` and caches its result
 * for `CACHE_TTL_MS`. Concurrent requests for the same key share one fetch,
 * and failed fetches aren't cached. Each caller gets its own copy of the value
 * so that a render that mutates it can't affect other requests.
 */
async function cachedFetch<T>(key: string, fetch: () => Promise<T>) {
  const now = Date.now();
  let entry = cache.get(key);
  if (!entry || entry.expiresAt <= now) {
    const value = fetch();
    entry = {expiresAt: now + CACHE_TTL_MS, value};
    cache.delete(key);
    cache.set(key, entry);
    value.catch(() => {
      if (cache.get(key) === entry) {
        cache.delete(key);
      }
    });
    // Map iteration follows insertion order, so the first keys are the oldest.
    while (cache.size > CACHE_MAX_ENTRIES) {
      cache.delete(cache.keys().next().value!);
    }
  }
  return structuredClone(await entry.value) as T;
}

/**
 * A `RootCMSClient` that caches published doc and translation reads in memory
 * for `CACHE_TTL_MS`, which saves a Firestore round trip on most page renders.
 * Published content can take up to that long to show up (plus any CDN cache
 * time), so this client shouldn't be used to serve previews.
 */
export class CachedRootCMSClient extends RootCMSClient {
  async getDoc<Fields = any>(
    collectionId: string,
    slug: string,
    options: GetDocOptions
  ) {
    if (options.mode !== 'published') {
      return super.getDoc<Fields>(collectionId, slug, options);
    }
    const key = JSON.stringify(['getDoc', collectionId, slug, options]);
    return cachedFetch(key, () =>
      super.getDoc<Fields>(collectionId, slug, options)
    );
  }

  async listDocs<T>(collectionId: string, options: ListDocsOptions) {
    // Queries with a `query` fn can't be keyed, so they're never cached.
    if (options.mode !== 'published' || options.query || options.raw) {
      return super.listDocs<T>(collectionId, options);
    }
    const key = JSON.stringify(['listDocs', collectionId, options]);
    return cachedFetch(key, () => super.listDocs<T>(collectionId, options));
  }

  async loadTranslations(
    options?: LoadTranslationsOptions
  ): Promise<TranslationsMap> {
    const key = JSON.stringify(['loadTranslations', options || {}]);
    return cachedFetch(key, () => super.loadTranslations(options));
  }
}
