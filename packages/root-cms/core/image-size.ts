/**
 * @fileoverview Lightweight, dependency-free image dimension reader.
 *
 * Used by server-side asset uploads (see `core/assets.ts`) to record the
 * `width` and `height` of uploaded images, mirroring what the CMS UI reads
 * from an `<img>` element in the browser. Only the file headers are parsed;
 * no pixel data is decoded.
 */

/** Pixel dimensions of an image. */
export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Returns the display dimensions of an image, or null if the format isn't
 * recognized or the header can't be parsed. `ext` is the normalized file
 * extension (e.g. `jpg`) and is only used as a hint for text-based formats
 * like SVG. JPEG and TIFF EXIF orientations that rotate the image by 90
 * degrees swap the width and height, matching how browsers display them.
 */
export function getImageSize(data: Uint8Array, ext?: string): ImageSize | null {
  try {
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const size = readImageSize(buf, ext);
    if (
      size &&
      Number.isFinite(size.width) &&
      Number.isFinite(size.height) &&
      size.width > 0 &&
      size.height > 0
    ) {
      return {width: Math.round(size.width), height: Math.round(size.height)};
    }
  } catch {
    // Truncated or malformed files fall through to null.
  }
  return null;
}

function readImageSize(buf: Buffer, ext?: string): ImageSize | null {
  if (isPng(buf)) {
    return {width: buf.readUInt32BE(16), height: buf.readUInt32BE(20)};
  }
  if (isGif(buf)) {
    return {width: buf.readUInt16LE(6), height: buf.readUInt16LE(8)};
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    return readJpegSize(buf);
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF') {
    if (buf.toString('ascii', 8, 12) === 'WEBP') {
      return readWebpSize(buf);
    }
    return null;
  }
  if (buf[0] === 0x42 && buf[1] === 0x4d) {
    // BMP: the height is negative for top-down bitmaps.
    return {width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22))};
  }
  if (isTiff(buf)) {
    return readTiffSize(buf);
  }
  if (buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1) {
    // ICO: use the first (typically largest) image entry. 0 means 256px.
    return {width: buf[6] || 256, height: buf[7] || 256};
  }
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    return readIspeSize(buf);
  }
  if (ext === 'svg' || looksLikeSvg(buf)) {
    return readSvgSize(buf.toString('utf8'));
  }
  return null;
}

function isPng(buf: Buffer) {
  return buf.toString('hex', 0, 8) === '89504e470d0a1a0a';
}

function isGif(buf: Buffer) {
  const sig = buf.toString('ascii', 0, 6);
  return sig === 'GIF87a' || sig === 'GIF89a';
}

function isTiff(buf: Buffer) {
  const sig = buf.toString('hex', 0, 4);
  return sig === '49492a00' || sig === '4d4d002a';
}

function looksLikeSvg(buf: Buffer) {
  const head = buf.toString('utf8', 0, Math.min(buf.length, 1024));
  return /<svg[\s>]/i.test(head);
}

/** JPEG SOF markers that carry the frame dimensions. */
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function readJpegSize(buf: Buffer): ImageSize | null {
  let orientation = 1;
  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    // Standalone markers (no length) and fill bytes.
    if (
      marker === 0xff ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd8)
    ) {
      offset += 2;
      continue;
    }
    const length = buf.readUInt16BE(offset + 2);
    if (
      marker === 0xe1 &&
      buf.toString('ascii', offset + 4, offset + 8) === 'Exif'
    ) {
      orientation = readExifOrientation(buf, offset + 10) || orientation;
    }
    if (JPEG_SOF_MARKERS.has(marker)) {
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return applyOrientation({width, height}, orientation);
    }
    offset += 2 + length;
  }
  return null;
}

/** Reads the orientation tag (0x0112) from a TIFF header at `start`. */
function readExifOrientation(buf: Buffer, start: number): number {
  const tag = readTiffTags(buf, start, [0x0112]);
  return tag.get(0x0112) || 0;
}

/**
 * Reads the values of the given tags from the first IFD of a TIFF structure
 * that begins at `start` (the byte order mark).
 */
function readTiffTags(
  buf: Buffer,
  start: number,
  tags: number[]
): Map<number, number> {
  const result = new Map<number, number>();
  const le = buf.toString('ascii', start, start + 2) === 'II';
  const u16 = (pos: number) =>
    le ? buf.readUInt16LE(pos) : buf.readUInt16BE(pos);
  const u32 = (pos: number) =>
    le ? buf.readUInt32LE(pos) : buf.readUInt32BE(pos);
  const ifdOffset = start + u32(start + 4);
  const numEntries = u16(ifdOffset);
  for (let i = 0; i < numEntries; i++) {
    const entry = ifdOffset + 2 + i * 12;
    const tag = u16(entry);
    if (!tags.includes(tag)) {
      continue;
    }
    const type = u16(entry + 2);
    // SHORT (3) values are stored in the first 2 bytes; LONG (4) in all 4.
    result.set(tag, type === 3 ? u16(entry + 8) : u32(entry + 8));
  }
  return result;
}

function readTiffSize(buf: Buffer): ImageSize | null {
  const tags = readTiffTags(buf, 0, [0x0100, 0x0101, 0x0112]);
  const width = tags.get(0x0100);
  const height = tags.get(0x0101);
  if (!width || !height) {
    return null;
  }
  return applyOrientation({width, height}, tags.get(0x0112) || 1);
}

/** EXIF orientations 5-8 rotate the image by 90 degrees. */
function applyOrientation(size: ImageSize, orientation: number): ImageSize {
  if (orientation >= 5 && orientation <= 8) {
    return {width: size.height, height: size.width};
  }
  return size;
}

function readWebpSize(buf: Buffer): ImageSize | null {
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return {
      width: 1 + buf.readUIntLE(24, 3),
      height: 1 + buf.readUIntLE(27, 3),
    };
  }
  if (chunk === 'VP8 ') {
    return {
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return {
      width: 1 + (bits & 0x3fff),
      height: 1 + ((bits >> 14) & 0x3fff),
    };
  }
  return null;
}

/** Reads the `ispe` (image spatial extents) box used by AVIF/HEIF files. */
function readIspeSize(buf: Buffer): ImageSize | null {
  const index = buf.indexOf('ispe');
  if (index < 0 || index + 16 > buf.length) {
    return null;
  }
  // Box type is followed by 4 bytes of version/flags, then width and height.
  return {
    width: buf.readUInt32BE(index + 8),
    height: buf.readUInt32BE(index + 12),
  };
}

function readSvgSize(svg: string): ImageSize | null {
  const match = svg.match(/<svg\b[^>]*>/i);
  if (!match) {
    return null;
  }
  const tag = match[0];
  const width = parseSvgLength(readSvgAttr(tag, 'width'));
  const height = parseSvgLength(readSvgAttr(tag, 'height'));
  const viewBox = (readSvgAttr(tag, 'viewBox') || '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  const hasViewBox = viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0;
  if (width && height) {
    return {width, height};
  }
  if (hasViewBox) {
    const ratio = viewBox[2] / viewBox[3];
    if (width) {
      return {width, height: width / ratio};
    }
    if (height) {
      return {width: height * ratio, height};
    }
    return {width: viewBox[2], height: viewBox[3]};
  }
  return null;
}

function readSvgAttr(tag: string, name: string): string | null {
  const re = new RegExp(`\\s${name}\\s*=\\s*(["'])([^"']*)\\1`, 'i');
  const match = tag.match(re);
  return match ? match[2] : null;
}

/** Parses an absolute SVG length, e.g. `200` or `200px`. Percentages are ignored. */
function parseSvgLength(value: string | null): number {
  if (!value) {
    return 0;
  }
  const match = value.trim().match(/^([\d.]+)(px)?$/);
  return match ? Number(match[1]) : 0;
}
