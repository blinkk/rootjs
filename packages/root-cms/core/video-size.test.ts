// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {getVideoSize} from './video-size.js';

// MP4 fixtures.

function box(type: string, ...children: Buffer[]) {
  const payload = Buffer.concat(children);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length, 0);
  header.write(type, 4, 'ascii');
  return Buffer.concat([header, payload]);
}

/** Builds a 64-bit "largesize" box. */
function largeBox(type: string, ...children: Buffer[]) {
  const payload = Buffer.concat(children);
  const header = Buffer.alloc(16);
  header.writeUInt32BE(1, 0);
  header.write(type, 4, 'ascii');
  header.writeBigUInt64BE(BigInt(16 + payload.length), 8);
  return Buffer.concat([header, payload]);
}

const IDENTITY = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];
const ROTATE_90 = [0, 0x10000, 0, -0x10000, 0, 0, 0, 0, 0x40000000];

function tkhd(
  width: number,
  height: number,
  options: {version?: number; matrix?: number[]} = {}
) {
  const version = options.version ?? 0;
  const timesSize = version === 1 ? 32 : 20;
  const payload = Buffer.alloc(4 + timesSize + 16 + 36 + 8);
  payload[0] = version;
  const matrixOffset = 4 + timesSize + 16;
  (options.matrix ?? IDENTITY).forEach((value, i) => {
    payload.writeInt32BE(value, matrixOffset + i * 4);
  });
  payload.writeUInt32BE(width * 0x10000, matrixOffset + 36);
  payload.writeUInt32BE(height * 0x10000, matrixOffset + 40);
  return box('tkhd', payload);
}

function hdlr(handlerType: string) {
  const payload = Buffer.alloc(24);
  payload.write(handlerType, 8, 'ascii');
  return box('hdlr', payload);
}

function trak(handlerType: string, tkhdBox: Buffer) {
  return box('trak', tkhdBox, box('mdia', box('mdhd'), hdlr(handlerType)));
}

function mp4(...boxes: Buffer[]) {
  return Buffer.concat([box('ftyp', Buffer.from('isom0000')), ...boxes]);
}

// WebM fixtures.

/** Encodes an EBML element with a 1-byte or 2-byte size. */
function ebml(id: number, data: Buffer) {
  const idBytes = Buffer.from(id.toString(16).padStart(2, '0'), 'hex');
  const idBuf = id > 0xffffff ? Buffer.alloc(4) : idBytes;
  if (id > 0xffffff) {
    idBuf.writeUInt32BE(id, 0);
  }
  let sizeBuf: Buffer;
  if (data.length < 0x7f) {
    sizeBuf = Buffer.from([0x80 | data.length]);
  } else {
    sizeBuf = Buffer.alloc(2);
    sizeBuf.writeUInt16BE(0x4000 | data.length, 0);
  }
  return Buffer.concat([idBuf, sizeBuf, data]);
}

function uint(id: number, value: number) {
  const data = Buffer.alloc(2);
  data.writeUInt16BE(value, 0);
  return ebml(id, data);
}

function webm(tracks: Buffer[], options: {unknownSize?: boolean} = {}) {
  const header = ebml(0x1a45dfa3, ebml(0x4282, Buffer.from('webm')));
  const tracksEl = ebml(0x1654ae6b, Buffer.concat(tracks));
  // A Cluster with junk data follows the tracks.
  const cluster = ebml(0x1f43b675, Buffer.alloc(16, 0xff));
  const segmentData = Buffer.concat([
    ebml(0x1549a966, Buffer.alloc(4)),
    tracksEl,
    cluster,
  ]);
  let segment: Buffer;
  if (options.unknownSize) {
    // 8-byte "unknown" size, as written by live encoders.
    segment = Buffer.concat([
      Buffer.from('18538067', 'hex'),
      Buffer.from('01ffffffffffffff', 'hex'),
      segmentData,
    ]);
  } else {
    segment = ebml(0x18538067, segmentData);
  }
  return Buffer.concat([header, segment]);
}

function webmTrack(trackType: number, video?: Buffer[]) {
  const children = [uint(0xd7, 1), uint(0x83, trackType)];
  if (video) {
    children.push(ebml(0xe0, Buffer.concat(video)));
  }
  return ebml(0xae, Buffer.concat(children));
}

describe('getVideoSize', () => {
  describe('mp4', () => {
    it('reads the video track size', () => {
      const data = mp4(
        box('moov', box('mvhd'), trak('vide', tkhd(1920, 1080)))
      );
      expect(getVideoSize(data)).toEqual({width: 1920, height: 1080});
    });

    it('skips audio tracks', () => {
      const data = mp4(
        box(
          'moov',
          trak('soun', tkhd(0, 0)),
          trak('vide', tkhd(1280, 720, {version: 1}))
        )
      );
      expect(getVideoSize(data)).toEqual({width: 1280, height: 720});
    });

    it('swaps the size for rotated tracks', () => {
      const data = mp4(
        box('moov', trak('vide', tkhd(1920, 1080, {matrix: ROTATE_90})))
      );
      expect(getVideoSize(data)).toEqual({width: 1080, height: 1920});
    });

    it('finds the moov box after the media data', () => {
      const data = mp4(
        largeBox('mdat', Buffer.alloc(64)),
        box('moov', trak('vide', tkhd(640, 360)))
      );
      expect(getVideoSize(data)).toEqual({width: 640, height: 360});
    });

    it('returns null without a video track', () => {
      expect(getVideoSize(mp4(box('moov', trak('soun', tkhd(0, 0)))))).toBe(
        null
      );
      expect(getVideoSize(mp4(box('mdat', Buffer.alloc(8))))).toBe(null);
    });
  });

  describe('webm', () => {
    it('reads the video track size', () => {
      const data = webm([
        webmTrack(2),
        webmTrack(1, [uint(0xb0, 1920), uint(0xba, 1080)]),
      ]);
      expect(getVideoSize(data)).toEqual({width: 1920, height: 1080});
    });

    it('supports segments with an unknown size', () => {
      const data = webm([webmTrack(1, [uint(0xb0, 640), uint(0xba, 480)])], {
        unknownSize: true,
      });
      expect(getVideoSize(data)).toEqual({width: 640, height: 480});
    });

    it('applies the display aspect ratio', () => {
      // Anamorphic 720x480 displayed at 16:9.
      const wide = webm([
        webmTrack(1, [
          uint(0xb0, 720),
          uint(0xba, 480),
          uint(0x54b0, 16),
          uint(0x54ba, 9),
        ]),
      ]);
      expect(getVideoSize(wide)).toEqual({width: 853, height: 480});
      // A display size matching the pixel aspect ratio is a no-op.
      const same = webm([
        webmTrack(1, [
          uint(0xb0, 1280),
          uint(0xba, 720),
          uint(0x54b0, 1280),
          uint(0x54ba, 720),
        ]),
      ]);
      expect(getVideoSize(same)).toEqual({width: 1280, height: 720});
    });

    it('returns null without a video track', () => {
      expect(getVideoSize(webm([webmTrack(2)]))).toBe(null);
    });
  });

  it('returns null for unknown or truncated files', () => {
    expect(getVideoSize(Buffer.from('hello world'))).toBe(null);
    expect(getVideoSize(Buffer.alloc(0))).toBe(null);
    const data = mp4(box('moov', trak('vide', tkhd(1920, 1080))));
    // Cut the file off within the track header, before its size fields.
    const tkhdOffset = data.indexOf('tkhd');
    expect(getVideoSize(data.subarray(0, tkhdOffset + 50))).toBe(null);
  });
});
