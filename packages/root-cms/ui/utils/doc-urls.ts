export function getDocServingUrl(docId: string): string;
export function getDocServingUrl(docId: string, slug: string): string;
export function getDocServingUrl(
  docIdOrCollection: string,
  slug?: string
): string {
  let collectionId = docIdOrCollection;
  if (!slug) {
    [collectionId, slug] = docIdOrCollection.split('/');
  }
  const urlPath = getDocServingPath(collectionId, slug);
  const domain = window.__ROOT_CTX.rootConfig.domain || 'https://example.com';
  return `${domain}${urlPath}`;
}

export function getDocServingPath(docId: string): string;
export function getDocServingPath(docId: string, slug: string): string;
export function getDocServingPath(
  docIdOrCollection: string,
  slug?: string | undefined
): string {
  let collectionId = docIdOrCollection;
  if (!slug) {
    [collectionId, slug] = docIdOrCollection.split('/');
  }
  const rootCollection = window.__ROOT_CTX.collections[collectionId];
  if (!rootCollection) {
    throw new Error(`collection not found: ${collectionId}`);
  }
  let servingPath = '';
  if (rootCollection?.url) {
    if (slug) {
      let urlPath = rootCollection.url
        .replace(/\[.*slug\]/, slug)
        .replaceAll('--', '/');
      // Rename `/index` to `/`.
      if (urlPath === '/index') {
        urlPath = '/';
      }
      servingPath = `${urlPath}`;
    } else {
      servingPath = `${rootCollection.url}`;
    }
  }
  return servingPath;
}

export function getDocPreviewPath(docId: string): string;
export function getDocPreviewPath(docId: string, slug: string): string;
export function getDocPreviewPath(
  docIdOrCollection: string,
  slug?: string | undefined
): string {
  let collectionId = docIdOrCollection;
  if (!slug) {
    [collectionId, slug] = docIdOrCollection.split('/');
  }
  const rootCollection = window.__ROOT_CTX.collections[collectionId];
  if (!rootCollection) {
    throw new Error(`collection not found: ${collectionId}`);
  }
  let previewPath = '';
  const previewPathConfig = rootCollection?.previewUrl || rootCollection?.url;
  if (previewPathConfig) {
    if (slug) {
      let urlPath = previewPathConfig
        .replace(/\[.*slug\]/, slug)
        .replaceAll('--', '/');
      // Rename `/index` to `/`.
      if (urlPath === '/index') {
        urlPath = '/';
      }
      previewPath = `${urlPath}`;
    } else {
      previewPath = `${previewPathConfig}`;
    }
  }
  return previewPath;
}
