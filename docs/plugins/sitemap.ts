import type {NextFunction, Plugin, Request, Response} from '@blinkk/root';
import {RootCMSClient, type Doc} from '@blinkk/root-cms/client';

/** A collection to list in the sitemap, and the URL format of its docs. */
interface SitemapCollection {
  id: string;
  /**
   * URL format, where `[slug]` or `[...slug]` is replaced with the doc's slug,
   * e.g. `/docs/[...slug]`.
   */
  url: string;
}

export interface SitemapPluginOptions {
  collections: SitemapCollection[];
  /** URL paths of pages that aren't CMS docs, e.g. `/blog/`. */
  staticPaths?: string[];
}

interface SitemapEntry {
  urlPath: string;
  lastmod?: string;
}

/**
 * Serves `/sitemap.xml`, listing every published doc in the given collections.
 * The sitemap is built from the CMS on each request, and cached by the CDN for
 * a few minutes, so newly published pages are listed without a deploy.
 *
 * Usage:
 *
 * ```ts
 * sitemapPlugin({
 *   collections: [{id: 'Pages', url: '/[...slug]'}],
 *   staticPaths: ['/blog/'],
 * });
 * ```
 */
export function sitemapPlugin(options: SitemapPluginOptions): Plugin {
  let cmsClient: RootCMSClient | null = null;
  return {
    name: 'sitemap',
    configureServer: (server, serverOptions) => {
      const rootConfig = serverOptions.rootConfig;
      server.use(
        '/sitemap.xml',
        async (req: Request, res: Response, next: NextFunction) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            next();
            return;
          }
          try {
            if (!cmsClient) {
              cmsClient = new RootCMSClient(rootConfig);
            }
            const entries = await listEntries(cmsClient, options);
            const domain = (rootConfig.domain || '').replace(/\/$/, '');
            res.setHeader('content-type', 'application/xml; charset=utf-8');
            res.setHeader('cache-control', 'public, max-age=300, s-maxage=600');
            res.send(renderSitemap(domain, entries));
          } catch (err) {
            next(err);
          }
        }
      );
    },
  };
}

async function listEntries(
  cmsClient: RootCMSClient,
  options: SitemapPluginOptions
): Promise<SitemapEntry[]> {
  const entries: SitemapEntry[] = (options.staticPaths || []).map(
    (urlPath) => ({urlPath})
  );
  const results = await Promise.all(
    options.collections.map((collection) =>
      cmsClient.listDocs<Doc>(collection.id, {mode: 'published'})
    )
  );
  options.collections.forEach((collection, i) => {
    for (const doc of results[i].docs) {
      entries.push({
        urlPath: getUrlPath(collection.url, doc.slug),
        lastmod: toIsoDate(doc.sys?.publishedAt),
      });
    }
  });
  // Dedupe (e.g. a static path that is also a doc) and sort by URL.
  const byPath = new Map<string, SitemapEntry>();
  for (const entry of entries) {
    byPath.set(entry.urlPath, {...byPath.get(entry.urlPath), ...entry});
  }
  return [...byPath.values()].sort((a, b) =>
    a.urlPath.localeCompare(b.urlPath)
  );
}

/**
 * Returns the URL path for a doc, with a trailing slash. Nested slugs are
 * stored with `--` in place of `/`, and `index` is the collection's root.
 */
function getUrlPath(urlFormat: string, slug: string) {
  const slugPath = slug === 'index' ? '' : slug.replaceAll('--', '/');
  const urlPath = urlFormat.replace(/\[(\.\.\.)?slug\]/, slugPath);
  return `${urlPath.replace(/\/+$/, '')}/`.replace(/\/+/g, '/');
}

function toIsoDate(value: unknown) {
  if (typeof value !== 'number') {
    return undefined;
  }
  return new Date(value).toISOString();
}

function renderSitemap(domain: string, entries: SitemapEntry[]) {
  const urls = entries.map((entry) => {
    const lines = [`    <loc>${escapeXml(domain + entry.urlPath)}</loc>`];
    if (entry.lastmod) {
      lines.push(`    <lastmod>${entry.lastmod}</lastmod>`);
    }
    return `  <url>\n${lines.join('\n')}\n  </url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
