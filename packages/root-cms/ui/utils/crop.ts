/** A rectangle, in image (natural) pixels. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The size of the image being cropped, in natural pixels. */
export interface CropBounds {
  width: number;
  height: number;
}

/**
 * The part of the crop box being dragged. `move` drags the whole box, the
 * other values are the edge or corner handle being resized.
 */
export type CropHandle =
  'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Options for {@link resizeCrop}. */
export interface ResizeCropOptions {
  /** The crop box when the drag started. */
  start: CropRect;
  /** The handle being dragged. */
  handle: CropHandle;
  /** The horizontal distance dragged, in natural pixels. */
  dx: number;
  /** The vertical distance dragged, in natural pixels. */
  dy: number;
  /** The size of the image. */
  bounds: CropBounds;
  /** The fixed aspect ratio (width / height), or `null` for a free crop. */
  aspect: number | null;
  /** The minimum width and height of the crop box, in natural pixels. */
  minSize?: number;
}

/**
 * Returns the largest crop box for the aspect ratio that fits inside the
 * image, centered on `center` (defaults to the center of the image) and
 * clamped to the image bounds. A `null` aspect returns the full image.
 */
export function fitCrop(
  bounds: CropBounds,
  aspect: number | null,
  center?: {x: number; y: number}
): CropRect {
  if (!aspect) {
    return {x: 0, y: 0, width: bounds.width, height: bounds.height};
  }
  let width = bounds.width;
  let height = width / aspect;
  if (height > bounds.height) {
    height = bounds.height;
    width = height * aspect;
  }
  const cx = center?.x ?? bounds.width / 2;
  const cy = center?.y ?? bounds.height / 2;
  return {
    x: clamp(cx - width / 2, 0, bounds.width - width),
    y: clamp(cy - height / 2, 0, bounds.height - height),
    width,
    height,
  };
}

/**
 * Returns the new crop box after dragging a handle (or the whole box) by
 * `dx`/`dy`. The result always stays inside the image bounds and, when an
 * aspect ratio is provided, keeps that aspect ratio.
 *
 * Corner handles keep the opposite corner anchored. Edge handles keep the
 * opposite edge anchored; with a fixed aspect ratio the perpendicular size
 * grows from the center of the edge.
 */
export function resizeCrop(options: ResizeCropOptions): CropRect {
  const {start, handle, dx, dy, bounds, aspect} = options;
  const minSize = Math.min(options.minSize ?? 1, bounds.width, bounds.height);

  if (handle === 'move') {
    return {
      ...start,
      x: clamp(start.x + dx, 0, bounds.width - start.width),
      y: clamp(start.y + dy, 0, bounds.height - start.height),
    };
  }

  const hasN = handle.includes('n');
  const hasS = handle.includes('s');
  const hasE = handle.includes('e');
  const hasW = handle.includes('w');
  const left = start.x;
  const top = start.y;
  const right = start.x + start.width;
  const bottom = start.y + start.height;

  if (!aspect) {
    let newLeft = left;
    let newTop = top;
    let newRight = right;
    let newBottom = bottom;
    if (hasW) {
      newLeft = clamp(left + dx, 0, right - minSize);
    }
    if (hasE) {
      newRight = clamp(right + dx, left + minSize, bounds.width);
    }
    if (hasN) {
      newTop = clamp(top + dy, 0, bottom - minSize);
    }
    if (hasS) {
      newBottom = clamp(bottom + dy, top + minSize, bounds.height);
    }
    return {
      x: newLeft,
      y: newTop,
      width: newRight - newLeft,
      height: newBottom - newTop,
    };
  }

  // The minimum width that satisfies the min size in both directions.
  const minWidth = Math.max(minSize, minSize * aspect);
  const isCorner = (hasN || hasS) && (hasE || hasW);

  if (isCorner) {
    const anchorX = hasE ? left : right;
    const anchorY = hasS ? top : bottom;
    const widthFromX = start.width + (hasE ? dx : -dx);
    const widthFromY = (start.height + (hasS ? dy : -dy)) * aspect;
    // Follow whichever direction the pointer moved further.
    let width = Math.max(widthFromX, widthFromY);
    const maxWidthX = hasE ? bounds.width - anchorX : anchorX;
    const maxHeightY = hasS ? bounds.height - anchorY : anchorY;
    const maxWidth = Math.min(maxWidthX, maxHeightY * aspect);
    width = clamp(width, Math.min(minWidth, maxWidth), maxWidth);
    const height = width / aspect;
    return {
      x: hasE ? anchorX : anchorX - width,
      y: hasS ? anchorY : anchorY - height,
      width,
      height,
    };
  }

  if (hasE || hasW) {
    const anchorX = hasE ? left : right;
    let width = start.width + (hasE ? dx : -dx);
    const maxWidthX = hasE ? bounds.width - anchorX : anchorX;
    const maxWidth = Math.min(maxWidthX, bounds.height * aspect);
    width = clamp(width, Math.min(minWidth, maxWidth), maxWidth);
    const height = width / aspect;
    const cy = top + start.height / 2;
    return {
      x: hasE ? anchorX : anchorX - width,
      y: clamp(cy - height / 2, 0, bounds.height - height),
      width,
      height,
    };
  }

  const anchorY = hasS ? top : bottom;
  let height = start.height + (hasS ? dy : -dy);
  const maxHeightY = hasS ? bounds.height - anchorY : anchorY;
  const maxHeight = Math.min(maxHeightY, bounds.width / aspect);
  const minHeight = minWidth / aspect;
  height = clamp(height, Math.min(minHeight, maxHeight), maxHeight);
  const width = height * aspect;
  const cx = left + start.width / 2;
  return {
    x: clamp(cx - width / 2, 0, bounds.width - width),
    y: hasS ? anchorY : anchorY - height,
    width,
    height,
  };
}

/**
 * Rounds a crop box to whole pixels, keeping it inside the image bounds. When
 * an aspect ratio is provided, the height is derived from the rounded width so
 * the output matches the aspect ratio as closely as possible.
 */
export function roundCrop(
  crop: CropRect,
  bounds: CropBounds,
  aspect: number | null
): CropRect {
  let width = Math.max(1, Math.min(Math.round(crop.width), bounds.width));
  let height = Math.max(1, Math.min(Math.round(crop.height), bounds.height));
  if (aspect) {
    height = Math.max(1, Math.round(width / aspect));
    if (height > bounds.height) {
      height = bounds.height;
      width = Math.max(1, Math.min(Math.round(height * aspect), bounds.width));
    }
  }
  const x = clamp(Math.round(crop.x), 0, bounds.width - width);
  const y = clamp(Math.round(crop.y), 0, bounds.height - height);
  return {x, y, width, height};
}

function clamp(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
