import {useEffect, useState} from 'preact/hooks';

const STORAGE_KEY = 'root::cms:recentViews';
const MAX_RECENT = 5;
const CHANGE_EVENT = 'rootcms:recentViewsChange';

export type RecentViewKind = 'doc' | 'collection' | 'data-source' | 'release';

export interface RecentView {
  kind: RecentViewKind;
  /** Stable key used for dedup; usually the destination URL. */
  url: string;
  /** Primary label (e.g. "Pages / home"). */
  label: string;
  /** Optional secondary text. */
  description?: string;
  /** ms epoch when the view was last recorded. */
  viewedAt: number;
}

function read(): RecentView[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (v): v is RecentView =>
        v &&
        typeof v === 'object' &&
        typeof v.url === 'string' &&
        typeof v.label === 'string' &&
        typeof v.kind === 'string'
    );
  } catch (_err) {
    return [];
  }
}

function write(views: RecentView[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch (err) {
    console.error('failed to persist recent views:', err);
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function getRecentViews(): RecentView[] {
  return read().sort((a, b) => b.viewedAt - a.viewedAt);
}

export function recordRecentView(view: Omit<RecentView, 'viewedAt'>): void {
  if (!view.url) {
    return;
  }
  const existing = read().filter((v) => v.url !== view.url);
  const next: RecentView[] = [{...view, viewedAt: Date.now()}, ...existing]
    .slice(0, MAX_RECENT);
  write(next);
}

export function clearRecentViews() {
  write([]);
}

/** Subscribes to recent-view changes (same-tab and cross-tab). */
export function useRecentViews(): RecentView[] {
  const [views, setViews] = useState<RecentView[]>(() => getRecentViews());
  useEffect(() => {
    const refresh = () => setViews(getRecentViews());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        refresh();
      }
    };
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return views;
}

/**
 * Inspects a CMS URL and returns the corresponding recent view, or null if
 * the URL is not one of the trackable views (doc, collection, data source, or
 * release).
 */
export function recentViewFromUrl(rawUrl: string): RecentView | null {
  let pathname = rawUrl;
  try {
    pathname = new URL(rawUrl, window.location.origin).pathname;
  } catch (_err) {
    pathname = rawUrl.split('?')[0] || rawUrl;
  }
  pathname = pathname.replace(/\/+$/, '');
  const segments = pathname.split('/').filter(Boolean);
  // /cms/content/:collection/:slug
  if (
    segments.length === 4 &&
    segments[0] === 'cms' &&
    segments[1] === 'content'
  ) {
    const collection = decodeURIComponent(segments[2]);
    const slug = decodeURIComponent(segments[3]);
    return {
      kind: 'doc',
      url: `/cms/content/${segments[2]}/${segments[3]}`,
      label: `${collection} / ${slug}`,
      viewedAt: 0,
    };
  }
  // /cms/content/:collection
  if (
    segments.length === 3 &&
    segments[0] === 'cms' &&
    segments[1] === 'content'
  ) {
    const collection = decodeURIComponent(segments[2]);
    const meta = window.__ROOT_CTX?.collections?.[collection];
    return {
      kind: 'collection',
      url: `/cms/content/${segments[2]}`,
      label: meta?.name || collection,
      description: meta?.description,
      viewedAt: 0,
    };
  }
  // /cms/data/:id (skip /cms/data/new and /cms/data/:id/edit)
  if (
    segments.length === 3 &&
    segments[0] === 'cms' &&
    segments[1] === 'data' &&
    segments[2] !== 'new'
  ) {
    const id = decodeURIComponent(segments[2]);
    return {
      kind: 'data-source',
      url: `/cms/data/${segments[2]}`,
      label: id,
      viewedAt: 0,
    };
  }
  // /cms/releases/:id (skip /cms/releases/new and /cms/releases/:id/edit)
  if (
    segments.length === 3 &&
    segments[0] === 'cms' &&
    segments[1] === 'releases' &&
    segments[2] !== 'new'
  ) {
    const id = decodeURIComponent(segments[2]);
    return {
      kind: 'release',
      url: `/cms/releases/${segments[2]}`,
      label: id,
      viewedAt: 0,
    };
  }
  return null;
}
