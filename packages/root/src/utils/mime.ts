/**
 * Maps file extensions (without a leading dot) to content types.
 */
const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  mjs: 'application/javascript',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  xml: 'application/xml',
  pdf: 'application/pdf',
  zip: 'application/zip',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  wasm: 'application/wasm',
};

/**
 * Returns the content type for a file extension, e.g. `.js` -> a JavaScript
 * MIME type. The extension may be passed with or without a leading dot.
 * Unknown extensions return `fallback` (`application/octet-stream` by default).
 *
 * This is used to set the correct `Content-Type` even for module scripts that
 * are missing or mistakenly served as empty, so the browser's ESM loader does
 * not reject the response with a MIME type mismatch error.
 */
export function getContentType(
  ext: string,
  fallback = 'application/octet-stream'
): string {
  const normalized = ext.trim().toLowerCase().replace(/^\./, '');
  return CONTENT_TYPES[normalized] || fallback;
}
