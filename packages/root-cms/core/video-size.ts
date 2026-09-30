/**
 * @fileoverview Lightweight, dependency-free video dimension reader.
 *
 * Used by server-side asset uploads (see `core/assets.ts`) to record the
 * `width` and `height` of uploaded videos, mirroring the `videoWidth` and
 * `videoHeight` the CMS UI reads from a `<video>` element in the browser.
 * Only container metadata is parsed; no frames are decoded.
 *
 * Supported containers:
 * - MP4/MOV (ISO BMFF): the `tkhd` box of the first video track. Tracks
 *   rotated by 90 or 270 degrees (e.g. portrait phone videos) have their
 *   width and height swapped, as browsers display them.
 * - WebM/Matroska (EBML): the `PixelWidth`/`PixelHeight` of the first video
 *   track, adjusted for its display aspect ratio.
 */

import type {ImageSize} from './image-size.js';

/**
 * Returns the display dimensions of a video, or null if the container isn't
 * recognized or doesn't contain a video track.
 */
export function getVideoSize(data: Uint8Array): ImageSize | null {
  try {
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    let size: ImageSize | null = null;
    if (buf.readUInt32BE(0) === EBML_ID) {
      size = readWebmSize(buf);
    } else if (buf.toString('ascii', 4, 8) === 'ftyp') {
      size = readMp4Size(buf);
    }
    if (size && size.width > 0 && size.height > 0) {
      return {width: Math.round(size.width), height: Math.round(size.height)};
    }
  } catch {
    // Truncated or malformed files fall through to null.
  }
  return null;
}

// MP4 (ISO BMFF).

interface Mp4Box {
  type: string;
  /** Offset of the box payload (after the size and type headers). */
  start: number;
  /** Offset of the end of the box. */
  end: number;
}

/** Iterates the child boxes within `[start, end)`. */
function* readMp4Boxes(
  buf: Buffer,
  start: number,
  end: number
): Generator<Mp4Box> {
  let offset = start;
  while (offset + 8 <= end) {
    let size = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    let headerSize = 8;
    if (size === 1) {
      // 64-bit "largesize" follows the type.
      size = Number(buf.readBigUInt64BE(offset + 8));
      headerSize = 16;
    } else if (size === 0) {
      // The box extends to the end of its parent.
      size = end - offset;
    }
    if (size < headerSize) {
      return;
    }
    const boxEnd = Math.min(offset + size, end);
    yield {type, start: offset + headerSize, end: boxEnd};
    offset += size;
  }
}

function findMp4Box(buf: Buffer, parent: Mp4Box, type: string) {
  for (const box of readMp4Boxes(buf, parent.start, parent.end)) {
    if (box.type === type) {
      return box;
    }
  }
  return null;
}

function readMp4Size(buf: Buffer): ImageSize | null {
  const root: Mp4Box = {type: 'root', start: 0, end: buf.length};
  const moov = findMp4Box(buf, root, 'moov');
  if (!moov) {
    return null;
  }
  for (const trak of readMp4Boxes(buf, moov.start, moov.end)) {
    if (trak.type !== 'trak') {
      continue;
    }
    const mdia = findMp4Box(buf, trak, 'mdia');
    const hdlr = mdia && findMp4Box(buf, mdia, 'hdlr');
    // The handler type follows version/flags (4) and pre_defined (4).
    if (
      !hdlr ||
      buf.toString('ascii', hdlr.start + 8, hdlr.start + 12) !== 'vide'
    ) {
      continue;
    }
    const tkhd = findMp4Box(buf, trak, 'tkhd');
    const size = tkhd && readTkhdSize(buf, tkhd);
    if (size) {
      return size;
    }
  }
  return null;
}

/** Reads the (rotation-adjusted) presentation size from a `tkhd` box. */
function readTkhdSize(buf: Buffer, tkhd: Mp4Box): ImageSize | null {
  const version = buf[tkhd.start];
  // Version 1 uses 64-bit creation/modification times and duration.
  const matrixOffset = tkhd.start + (version === 1 ? 52 : 40);
  const sizeOffset = matrixOffset + 36;
  if (sizeOffset + 8 > tkhd.end) {
    return null;
  }
  // Width and height are 16.16 fixed-point values.
  const width = buf.readUInt32BE(sizeOffset) / 0x10000;
  const height = buf.readUInt32BE(sizeOffset + 4) / 0x10000;
  if (!width || !height) {
    return null;
  }
  // The matrix is `[a b u; c d v; x y w]`. A 90 or 270 degree rotation has
  // `a = d = 0`.
  const a = buf.readInt32BE(matrixOffset);
  const d = buf.readInt32BE(matrixOffset + 16);
  if (a === 0 && d === 0) {
    return {width: height, height: width};
  }
  return {width, height};
}

// WebM / Matroska (EBML).

const EBML_ID = 0x1a45dfa3;
const SEGMENT_ID = 0x18538067;
const TRACKS_ID = 0x1654ae6b;
const TRACK_ENTRY_ID = 0xae;
const TRACK_TYPE_ID = 0x83;
const VIDEO_ID = 0xe0;
const PIXEL_WIDTH_ID = 0xb0;
const PIXEL_HEIGHT_ID = 0xba;
const DISPLAY_WIDTH_ID = 0x54b0;
const DISPLAY_HEIGHT_ID = 0x54ba;
const DISPLAY_UNIT_ID = 0x54b2;
/** Matroska `TrackType` value for video tracks. */
const TRACK_TYPE_VIDEO = 1;

interface EbmlElement {
  id: number;
  /** Offset of the element data. */
  start: number;
  /** Offset of the end of the element. */
  end: number;
}

/**
 * Reads an EBML variable-length integer at `offset`. Element ids keep their
 * length marker bits; data sizes have them stripped. Returns null for an
 * invalid vint, and `size: -1` for an "unknown" data size (all value bits
 * set), which is used by live-streamed segments.
 */
function readVint(
  buf: Buffer,
  offset: number,
  keepMarker: boolean
): {value: number; length: number} | null {
  const first = buf[offset];
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) {
    length++;
  }
  if (length > 8 || offset + length > buf.length) {
    return null;
  }
  let value = keepMarker ? first : first & (0xff >> length);
  let allOnes = value === 0xff >> length;
  for (let i = 1; i < length; i++) {
    const byte = buf[offset + i];
    value = value * 256 + byte;
    allOnes = allOnes && byte === 0xff;
  }
  if (!keepMarker && allOnes) {
    return {value: -1, length};
  }
  return {value, length};
}

/** Iterates the child elements within `[start, end)`. */
function* readEbmlElements(
  buf: Buffer,
  start: number,
  end: number
): Generator<EbmlElement> {
  let offset = start;
  while (offset < end) {
    const id = readVint(buf, offset, true);
    const size = id && readVint(buf, offset + id.length, false);
    if (!id || !size) {
      return;
    }
    const dataStart = offset + id.length + size.length;
    // Unknown-size elements extend to the end of their parent.
    const dataEnd =
      size.value < 0 ? end : Math.min(dataStart + size.value, end);
    yield {id: id.value, start: dataStart, end: dataEnd};
    offset = dataEnd;
  }
}

function readEbmlUint(buf: Buffer, el: EbmlElement): number {
  let value = 0;
  for (let i = el.start; i < el.end; i++) {
    value = value * 256 + buf[i];
  }
  return value;
}

function readWebmSize(buf: Buffer): ImageSize | null {
  for (const segment of readEbmlElements(buf, 0, buf.length)) {
    if (segment.id !== SEGMENT_ID) {
      continue;
    }
    for (const tracks of readEbmlElements(buf, segment.start, segment.end)) {
      if (tracks.id !== TRACKS_ID) {
        continue;
      }
      for (const entry of readEbmlElements(buf, tracks.start, tracks.end)) {
        if (entry.id === TRACK_ENTRY_ID) {
          const size = readWebmTrackSize(buf, entry);
          if (size) {
            return size;
          }
        }
      }
    }
  }
  return null;
}

function readWebmTrackSize(buf: Buffer, entry: EbmlElement): ImageSize | null {
  let trackType = 0;
  let video: EbmlElement | null = null;
  for (const el of readEbmlElements(buf, entry.start, entry.end)) {
    if (el.id === TRACK_TYPE_ID) {
      trackType = readEbmlUint(buf, el);
    } else if (el.id === VIDEO_ID) {
      video = el;
    }
  }
  if (!video || (trackType && trackType !== TRACK_TYPE_VIDEO)) {
    return null;
  }
  const values = new Map<number, number>();
  for (const el of readEbmlElements(buf, video.start, video.end)) {
    values.set(el.id, readEbmlUint(buf, el));
  }
  const width = values.get(PIXEL_WIDTH_ID) || 0;
  const height = values.get(PIXEL_HEIGHT_ID) || 0;
  if (!width || !height) {
    return null;
  }
  // A display size in pixels (unit 0) sets the display aspect ratio. As in
  // browsers, the frame is stretched (never shrunk) to match it.
  const displayWidth = values.get(DISPLAY_WIDTH_ID);
  const displayHeight = values.get(DISPLAY_HEIGHT_ID);
  const displayUnit = values.get(DISPLAY_UNIT_ID) || 0;
  if (displayWidth && displayHeight && displayUnit === 0) {
    const aspect = displayWidth / displayHeight;
    if (aspect > width / height) {
      return {width: height * aspect, height};
    }
    if (aspect < width / height) {
      return {width, height: width / aspect};
    }
  }
  return {width, height};
}
