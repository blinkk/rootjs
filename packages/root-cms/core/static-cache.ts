/** Matches the content hash esbuild adds to chunk filenames. */
const HASHED_FILE_REGEX = /-[A-Z0-9]{8}\.(?:js|css)$/;

/**
 * Returns the `cache-control` header for a CMS UI static file. Filenames with
 * a content hash never change, so they can be cached for good. Everything else
 * (e.g. `ui.js`, which imports the hashed chunks) is revalidated on each load.
 * The `?c=` cachebust param isn't enough for those, since it only changes with
 * the package version.
 */
export function getStaticCacheControl(pathname: string): string {
  if (HASHED_FILE_REGEX.test(pathname)) {
    return 'public, max-age=31536000, immutable';
  }
  return 'no-cache';
}
