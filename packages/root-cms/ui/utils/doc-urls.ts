interface DocUrlOptions {
  collectionId: string;
  slug: string;
  locale?: string;
}

export function getDocServingUrl(options: DocUrlOptions) {
  const collections = window.__ROOT_CTX.collections;
  const rootCollection = collections[options.collectionId];
  if (!rootCollection) {
    throw new Error(`collection not found: ${options.collectionId}`);
  }
  const domain =
    rootCollection.domain ||
    window.__ROOT_CTX.rootConfig.domain ||
    'https://example.com';
  const urlPath = getDocServingPath(options);
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
  const basePath = rootConfig.base || '/';
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
  const basePath = rootConfig.base || '/';
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
  return normalizeUrlPath(urlPath, {
    trailingSlash: window.__ROOT_CTX.rootConfig.server.trailingSlash,
  });
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
  // Convert `/index` to `/`.
  if (urlPath.endsWith('/index') || urlPath.endsWith('/index/')) {
    urlPath = urlPath.slice(0, -6);
  }
  // Add leading slash if needed.
  if (!urlPath.startsWith('/')) {
    urlPath = `/${urlPath}`;
  }
  // Add trailing slash if needed.
  if (options?.trailingSlash && !urlPath.endsWith('/')) {
    urlPath = `${urlPath}/`;
  }
  return urlPath;
}
