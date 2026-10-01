// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {getImageSize} from './image-size.js';

function png(width: number, height: number) {
  const buf = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function gif(width: number, height: number) {
  const buf = Buffer.alloc(10);
  buf.write('GIF89a', 0, 'ascii');
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

/** Builds a JPEG with an optional EXIF orientation and a SOF0 frame. */
function jpeg(width: number, height: number, orientation?: number) {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];
  if (orientation) {
    // TIFF header (little endian) with a single IFD entry.
    const tiff = Buffer.alloc(26);
    tiff.write('II', 0, 'ascii');
    tiff.writeUInt16LE(42, 2);
    tiff.writeUInt32LE(8, 4);
    tiff.writeUInt16LE(1, 8);
    tiff.writeUInt16LE(0x0112, 10);
    tiff.writeUInt16LE(3, 12);
    tiff.writeUInt32LE(1, 14);
    tiff.writeUInt16LE(orientation, 18);
    const exif = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
    const app1 = Buffer.alloc(4);
    app1.writeUInt16BE(0xffe1, 0);
    app1.writeUInt16BE(exif.length + 2, 2);
    parts.push(app1, exif);
  }
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  parts.push(sof);
  return Buffer.concat(parts);
}

function webpVp8x(width: number, height: number) {
  const buf = Buffer.alloc(30);
  buf.write('RIFF', 0, 'ascii');
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8X', 12, 'ascii');
  buf.writeUIntLE(width - 1, 24, 3);
  buf.writeUIntLE(height - 1, 27, 3);
  return buf;
}

function webpVp8l(width: number, height: number) {
  const buf = Buffer.alloc(25);
  buf.write('RIFF', 0, 'ascii');
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8L', 12, 'ascii');
  buf[20] = 0x2f;
  buf.writeUInt32LE((width - 1) | ((height - 1) << 14), 21);
  return buf;
}

function bmp(width: number, height: number) {
  const buf = Buffer.alloc(26);
  buf.write('BM', 0, 'ascii');
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  return buf;
}

describe('getImageSize', () => {
  it('reads png dimensions', () => {
    expect(getImageSize(png(640, 480), 'png')).toEqual({
      width: 640,
      height: 480,
    });
  });

  it('reads gif dimensions', () => {
    expect(getImageSize(gif(32, 16))).toEqual({width: 32, height: 16});
  });

  it('reads jpeg dimensions', () => {
    expect(getImageSize(jpeg(1920, 1080))).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it('swaps jpeg dimensions for rotated exif orientations', () => {
    expect(getImageSize(jpeg(1920, 1080, 6))).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(getImageSize(jpeg(1920, 1080, 3))).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it('reads webp dimensions', () => {
    expect(getImageSize(webpVp8x(800, 600))).toEqual({width: 800, height: 600});
    expect(getImageSize(webpVp8l(300, 200))).toEqual({width: 300, height: 200});
  });

  it('reads bmp dimensions', () => {
    expect(getImageSize(bmp(64, -48))).toEqual({width: 64, height: 48});
  });

  it('reads svg dimensions', () => {
    const svg = (attrs: string) => Buffer.from(`<svg ${attrs}></svg>`);
    expect(getImageSize(svg('width="200" height="100"'), 'svg')).toEqual({
      width: 200,
      height: 100,
    });
    expect(getImageSize(svg('viewBox="0 0 40 20"'), 'svg')).toEqual({
      width: 40,
      height: 20,
    });
    expect(
      getImageSize(svg('width="100px" viewBox="0 0 40 20"'), 'svg')
    ).toEqual({width: 100, height: 50});
    expect(
      getImageSize(
        Buffer.from('<?xml version="1.0"?>\n<svg width="5" height="6">')
      )
    ).toEqual({width: 5, height: 6});
    expect(getImageSize(svg('width="100%"'), 'svg')).toBeNull();
  });

  it('returns null for unknown or truncated files', () => {
    expect(getImageSize(Buffer.from('hello world'))).toBeNull();
    expect(getImageSize(png(10, 10).subarray(0, 12))).toBeNull();
    expect(getImageSize(Buffer.alloc(0))).toBeNull();
  });
});
