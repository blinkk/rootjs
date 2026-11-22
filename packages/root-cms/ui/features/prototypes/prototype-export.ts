import type {
  PrototypeFrame,
  PrototypeTheme,
} from '../../../shared/prototypes.js';
import {
  DEFAULT_FOLD_HEIGHT_DESKTOP,
  DEFAULT_FOLD_HEIGHT_MOBILE,
  getOrderedBlocks,
} from '../../../shared/prototypes.js';

/** Export payload returned by a live `prototype-runtime.js` iframe. */
export interface PrototypeExportPayload {
  /** Frame identifier. */
  frameId: string;
  /** Rendered inner HTML of `#proto-root`. */
  html: string;
  /** Compiled Tailwind + theme + block CSS rules. */
  compiledCss: string;
  /** Viewport width in CSS px. */
  width: number;
  /** Measured content height in CSS px. */
  height: number;
}

/** Options for exporting one or more prototype frames to PNG or JPG. */
export interface ExportFramesOptions {
  /** Board title used in the downloaded filename. */
  boardTitle: string;
  /** Frames to export (single selected frame or all frames on the active page). */
  frames: PrototypeFrame[];
  /** Board theme tokens for background and CSS variable fallbacks. */
  theme: PrototypeTheme;
  /** Output image format. */
  format: 'png' | 'jpg';
  /** Optional callback to fetch compiled CSS + HTML from a mounted iframe. */
  requestExportPayload?: (
    frameId: string
  ) => Promise<PrototypeExportPayload | null>;
}

/** Maximum pixel dimension on either axis to keep browser canvas allocation safe. */
const MAX_CANVAS_EDGE = 12000;

/** Device scale factor for crisp `@2x` exports. */
const EXPORT_SCALE = 2;

/** Builds `:root` CSS custom properties from a `PrototypeTheme`. */
export function buildPrototypeThemeCss(theme: PrototypeTheme): string {
  const vars: string[] = [];
  if (theme.colorBg) {
    vars.push(`--color-bg: ${theme.colorBg};`);
  }
  if (theme.colorSurface) {
    vars.push(`--color-surface: ${theme.colorSurface};`);
  }
  if (theme.colorFg) {
    vars.push(`--color-fg: ${theme.colorFg};`);
  }
  if (theme.colorMuted) {
    vars.push(`--color-muted: ${theme.colorMuted};`);
  }
  if (theme.colorPrimary) {
    vars.push(`--color-primary: ${theme.colorPrimary};`);
  }
  if (theme.colorOnPrimary) {
    vars.push(`--color-on-primary: ${theme.colorOnPrimary};`);
  }
  if (theme.colorBorder) {
    vars.push(`--color-border: ${theme.colorBorder};`);
  }
  if (theme.fontSans) {
    vars.push(`--font-sans: ${theme.fontSans};`);
  }
  if (theme.fontHeading) {
    vars.push(`--font-heading: ${theme.fontHeading};`);
  }
  if (theme.fontMono) {
    vars.push(`--font-mono: ${theme.fontMono};`);
  }
  if (theme.radius) {
    vars.push(`--radius-base: ${theme.radius};`);
  }
  if (theme.containerMaxWidth) {
    vars.push(`--max-w-container: ${theme.containerMaxWidth};`);
  }
  const bodyBg = theme.colorBg || '#ffffff';
  const bodyFg = theme.colorFg || '#111827';
  const bodyFont =
    theme.fontSans ||
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const varBlock = vars.join('\n  ');
  return [
    `:root {\n  ${varBlock}\n}`,
    `@theme {\n  ${varBlock}\n}`,
    `body { margin: 0; background: ${bodyBg}; color: ${bodyFg}; font-family: ${bodyFont}; }`,
  ].join('\n');
}

/** Escapes special HTML attribute characters. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Serializes a frame's ordered blocks into `<section>` HTML and combined CSS. */
export function buildFrameRenderContent(frame: PrototypeFrame): {
  html: string;
  blockCss: string;
} {
  const ordered = getOrderedBlocks(frame.blocks);
  const htmlParts: string[] = [];
  const cssParts: string[] = [];
  for (const {key, block} of ordered) {
    htmlParts.push(
      `<section data-block-key="${escapeAttr(key)}" data-component="${escapeAttr(block.component)}">${block.html}</section>`
    );
    if (block.css) {
      cssParts.push(block.css);
    }
  }
  return {
    html: htmlParts.join('\n'),
    blockCss: cssParts.join('\n'),
  };
}

/** Replaces external image URLs with an inline placeholder SVG to avoid canvas tainting. */
function stripExternalImages(html: string): string {
  const placeholder =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="100%" height="100%" fill="#f1f5f9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-family="sans-serif" font-size="18">Image</text></svg>'
    );
  return html.replace(
    /(<img\b[^>]*?\bsrc=["'])(https?:\/\/[^"']+)(["'])/gi,
    `$1${placeholder}$3`
  );
}

/** Escapes CSS content so it cannot break out of a `<style>` tag inside XHTML. */
function escapeStyleForXhtml(css: string): string {
  return css
    .replace(/<\/style/gi, '<\\/style')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Converts arbitrary HTML fragment into well-formed XHTML via browser DOMParser + XMLSerializer. */
function serializeFragmentToXhtml(html: string): string {
  const doc = new DOMParser().parseFromString(
    `<div id="proto-export-root">${html}</div>`,
    'text/html'
  );
  const root = doc.getElementById('proto-export-root');
  if (!root) {
    return '';
  }
  return new XMLSerializer().serializeToString(root);
}

/** Rasterizes a single frame payload into an `HTMLImageElement` using SVG `foreignObject`. */
function loadFrameSvgImage(
  payload: PrototypeExportPayload,
  theme: PrototypeTheme,
  stripImages: boolean
): Promise<HTMLImageElement> {
  const width = Math.max(320, Math.round(payload.width));
  const height = Math.max(200, Math.round(payload.height));
  const foldHeight =
    width <= 480 ? DEFAULT_FOLD_HEIGHT_MOBILE : DEFAULT_FOLD_HEIGHT_DESKTOP;
  const bodyBg = theme.colorBg || '#ffffff';
  const bodyFg = theme.colorFg || '#111827';
  const bodyFont =
    theme.fontSans ||
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const rawHtml = stripImages
    ? stripExternalImages(payload.html)
    : payload.html;
  const xhtmlBody = serializeFragmentToXhtml(rawHtml);
  const css = [
    '*, *::before, *::after { box-sizing: border-box; }',
    `:root { --proto-vh: ${foldHeight / 100}px; }`,
    `#proto-export-root { width: ${width}px; min-height: ${height}px; margin: 0; background: ${bodyBg}; color: ${bodyFg}; font-family: ${bodyFont}; }`,
    payload.compiledCss,
  ].join('\n');

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<foreignObject width="100%" height="100%">',
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;min-height:${height}px;background:${bodyBg};overflow:hidden;">`,
    `<style>${escapeStyleForXhtml(css)}</style>`,
    xhtmlBody,
    '</div>',
    '</foreignObject>',
    '</svg>',
  ].join('');

  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error('Failed to rasterize prototype frame SVG.'));
    img.src = dataUrl;
  });
}

/** Produces a clean filename slug from a title. */
function slugifyFilename(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'prototype'
  );
}

/** Triggers a browser download for a rendered canvas blob. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Exports one or more prototype frames at `@2x` resolution as a PNG or JPG
 * download. Uses live compiled CSS from mounted iframes when available, and
 * falls back cleanly when frames are offscreen or contain cross-origin images.
 */
export async function exportFramesToImage(
  options: ExportFramesOptions
): Promise<void> {
  const {boardTitle, frames, theme, format, requestExportPayload} = options;
  if (frames.length === 0) {
    throw new Error('No frames available to export.');
  }

  const payloads: Array<{
    frame: PrototypeFrame;
    payload: PrototypeExportPayload;
  }> = [];

  for (const frame of frames) {
    let payload: PrototypeExportPayload | null = null;
    if (requestExportPayload) {
      try {
        payload = await requestExportPayload(frame.id);
      } catch {
        payload = null;
      }
    }
    if (!payload) {
      const rendered = buildFrameRenderContent(frame);
      payload = {
        frameId: frame.id,
        html: rendered.html,
        compiledCss: `${buildPrototypeThemeCss(theme)}\n${rendered.blockCss}`,
        width: frame.width,
        height: Math.max(frame.cachedHeight || 720, 240),
      };
    }
    payloads.push({frame, payload});
  }

  const isMulti = payloads.length > 1;
  const outerPadding = isMulti ? 48 : 0;
  const frameGap = isMulti ? 48 : 0;
  const labelHeight = isMulti ? 32 : 0;

  const totalWidth =
    outerPadding * 2 +
    payloads.reduce((sum, item) => sum + item.payload.width, 0) +
    frameGap * Math.max(0, payloads.length - 1);
  const maxHeight = Math.max(
    ...payloads.map((item) => item.payload.height),
    200
  );
  const totalHeight = outerPadding * 2 + labelHeight + maxHeight;

  const scale = Math.min(
    EXPORT_SCALE,
    MAX_CANVAS_EDGE / Math.max(1, totalWidth),
    MAX_CANVAS_EDGE / Math.max(1, totalHeight)
  );

  async function renderCanvas(stripImages: boolean): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(totalWidth * scale));
    canvas.height = Math.max(1, Math.round(totalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize 2D export canvas.');
    }
    ctx.scale(scale, scale);
    ctx.fillStyle = isMulti
      ? '#f5f5f3'
      : format === 'jpg'
        ? theme.colorBg || '#ffffff'
        : theme.colorBg || '#ffffff';
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    let cursorX = outerPadding;
    for (const {frame, payload} of payloads) {
      if (isMulti) {
        ctx.fillStyle = '#4b5563';
        ctx.font =
          '600 14px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(
          `${frame.title} · ${frame.width}px`,
          cursorX,
          outerPadding + 18
        );
      }
      const img = await loadFrameSvgImage(payload, theme, stripImages);
      ctx.drawImage(
        img,
        cursorX,
        outerPadding + labelHeight,
        payload.width,
        payload.height
      );
      cursorX += payload.width + frameGap;
    }

    const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const quality = format === 'jpg' ? 0.92 : undefined;
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas export produced an empty image.'));
              return;
            }
            resolve(blob);
          },
          mimeType,
          quality
        );
      } catch (err) {
        reject(err);
      }
    });
  }

  let blob: Blob;
  try {
    blob = await renderCanvas(false);
  } catch {
    // Retry with external image URLs replaced so cross-origin images never
    // block an export with a tainted-canvas SecurityError.
    blob = await renderCanvas(true);
  }

  const baseName =
    payloads.length === 1
      ? `${slugifyFilename(boardTitle)}-${slugifyFilename(payloads[0].frame.title)}`
      : slugifyFilename(boardTitle);
  downloadBlob(blob, `${baseName}.${format}`);
}
