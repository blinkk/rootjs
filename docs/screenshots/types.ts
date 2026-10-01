/** Metadata exported by each scene in `screenshots/scenes/`. */
export interface SceneMeta {
  /** Stable id, used as the key in `screenshots.json` and the output filename. */
  id: string;
  /** Viewport width in CSS pixels. The PNG is rendered at 2x by default. */
  width: number;
  /** Viewport height in CSS pixels. */
  height: number;
  /** Alt text for the rendered image. */
  alt: string;
}

/** A single entry in `screenshots.json`. */
export interface ScreenshotEntry {
  /**
   * Id of the CMS asset library file the screenshot is uploaded to. Image
   * fields that embed the asset are updated whenever the screenshot is
   * re-uploaded.
   */
  assetId: string;
  /** Public image URL (a GCI serving URL when available). */
  src: string;
  /** Rendered image width in pixels. */
  width: number;
  /** Rendered image height in pixels. */
  height: number;
  /** Alt text for the image. */
  alt: string;
  /** Path of the uploaded object, e.g. `/bucket/www/uploads/abc123.png`. */
  gcsPath?: string;
  /** Content hash of the PNG, used to skip re-uploading unchanged images. */
  hash: string;
}

/** The shape of `screenshots.json`, keyed by scene id. */
export type ScreenshotsMap = Record<string, ScreenshotEntry>;

/**
 * An entry in `screenshots/.out/manifest.json`, written by
 * `scripts/screenshots_render.ts` and read by `scripts/screenshots_upload.ts`.
 */
export type ManifestEntry = SceneMeta & {
  /** Device scale factor the scene was rendered at. */
  scale: number;
  /** PNG filename within `screenshots/.out/`. */
  file: string;
  /**
   * Hash of the scene sources the PNG was rendered from (see
   * `scripts/screenshots_sources.ts`). Used to catch stale renders.
   */
  sourceHash: string;
};
