interface DocUrlOptions {
  collectionId: string;
  slug: string;
  locale?: string;
}

export function getDocServingUrl(options: DocUrlOptions) {
  const urlPath = getDocServingPath(options);
  const domain = window.__ROOT_CTX.rootConfig.domain || 'https://example.com';
  return `${domain}${urlPath}`;
}

export function getDocServingPath(options: DocUrlOptions) {
  const collections = window.__ROOT_CTX.collections;
  const {collectionId, slug, locale} = options;
  const rootCollection = collections[collectionId];
  if (!rootCollection) {
    throw new Error(`collection not found: ${collectionId}`);
  }

  const rootConfig = window.__ROOT_CTX.rootConfig;
  const basePath = rootConfig.basePath || '/';
  let urlFormat = '/[base]/[path]';
  if (locale) {
    urlFormat = rootConfig.i18n.urlFormat || '/[locale]/[base]/[path]';
  }

  let relativePath = '';
  const servingPathFormat = rootCollection?.url;
  if (servingPathFormat) {
    if (slug) {
      let urlPath = servingPathFormat
        .replace(/\[.*slug\]/, slug)
        .replaceAll('--', '/')
        .replace(/\/+/g, '/');
      // Rename `/index` to `/`.
      if (urlPath === '/index') {
        urlPath = '/';
      }
      relativePath = urlPath;
    } else {
      relativePath = servingPathFormat;
    }
  }

  return formatUrlPath(urlFormat, {
    base: basePath,
    path: relativePath,
    locale: locale || '',
    slug: slug,
  });
}

export function getDocPreviewPath(options: DocUrlOptions) {
  const collections = window.__ROOT_CTX.collections;
  const {collectionId, slug, locale} = options;
  const rootCollection = collections[collectionId];
  if (!rootCollection) {
    throw new Error(`collection not found: ${collectionId}`);
  }

  const rootConfig = window.__ROOT_CTX.rootConfig;
  const basePath = rootConfig.basePath || '/';
  let urlFormat = '/[base]/[path]';
  if (locale) {
    urlFormat = rootConfig.i18n.urlFormat || '/[locale]/[base]/[path]';
  }

  let relativePath = '';
  const previewPathFormat = rootCollection?.previewUrl || rootCollection?.url;
  if (previewPathFormat) {
    if (slug) {
      let urlPath = previewPathFormat
        .replace(/\[.*slug\]/, slug)
        .replaceAll('--', '/')
        .replace(/\/+/g, '/');
      // Rename `/index` to `/`.
      if (urlPath === '/index') {
        urlPath = '/';
      }
      relativePath = urlPath;
    } else {
      relativePath = previewPathFormat;
    }
  }

  return formatUrlPath(urlFormat, {
    base: basePath,
    path: relativePath,
    locale: locale || '',
    slug: slug,
  });
}

function formatUrlPath(urlFormat: string, params: Record<string, string>) {
  const urlPath = urlFormat.replaceAll(
    /\[\[?(\.\.\.)?([\w\-_]*)\]?\]/g,
    (match: string, _wildcard: string, key: string) => {
      return params[key] ?? match;
    }
  );
  return normalizeUrlPath(urlPath);
}

function normalizeUrlPath(
  urlPath: string,
  options?: {trailingSlash?: boolean}
) {
  // Collapse multiple slashes, e.g. `/foo//bar` => `/foo/bar`;
  urlPath = urlPath.replace(/\/+/g, '/');
  // Remove trailing slash.
  if (
    options?.trailingSlash === false &&
    urlPath !== '/' &&
    urlPath.endsWith('/')
  ) {
    urlPath = urlPath.replace(/\/*$/g, '');
  }
  // Add leading slash if needed.
  if (!urlPath.startsWith('/')) {
    urlPath = `/${urlPath}`;
  }
  return urlPath;
}
