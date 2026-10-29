import {describe, expect, it} from 'vitest';
import {fitCrop, resizeCrop, roundCrop} from './crop.js';

const bounds = {width: 1000, height: 500};

describe('fitCrop', () => {
  it('returns the full image for a free crop', () => {
    expect(fitCrop(bounds, null)).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 500,
    });
  });

  it('returns the largest centered box for an aspect ratio', () => {
    expect(fitCrop(bounds, 1)).toEqual({x: 250, y: 0, width: 500, height: 500});
    expect(fitCrop(bounds, 4)).toEqual({
      x: 0,
      y: 125,
      width: 1000,
      height: 250,
    });
  });

  it('centers on a point, clamped to the image bounds', () => {
    expect(fitCrop(bounds, 1, {x: 100, y: 250})).toEqual({
      x: 0,
      y: 0,
      width: 500,
      height: 500,
    });
    expect(fitCrop(bounds, 1, {x: 600, y: 250}).x).toBe(350);
  });
});

describe('resizeCrop', () => {
  const start = {x: 100, y: 100, width: 200, height: 100};

  it('moves the crop box within the bounds', () => {
    expect(
      resizeCrop({start, handle: 'move', dx: 50, dy: 20, bounds, aspect: null})
    ).toEqual({x: 150, y: 120, width: 200, height: 100});
    expect(
      resizeCrop({
        start,
        handle: 'move',
        dx: 5000,
        dy: -5000,
        bounds,
        aspect: null,
      })
    ).toEqual({x: 800, y: 0, width: 200, height: 100});
  });

  it('resizes edges freely without an aspect ratio', () => {
    expect(
      resizeCrop({start, handle: 'e', dx: 100, dy: 0, bounds, aspect: null})
    ).toEqual({x: 100, y: 100, width: 300, height: 100});
    expect(
      resizeCrop({start, handle: 'nw', dx: -50, dy: -50, bounds, aspect: null})
    ).toEqual({x: 50, y: 50, width: 250, height: 150});
  });

  it('clamps free resizes to the bounds and min size', () => {
    expect(
      resizeCrop({start, handle: 'w', dx: -500, dy: 0, bounds, aspect: null})
    ).toEqual({x: 0, y: 100, width: 300, height: 100});
    expect(
      resizeCrop({
        start,
        handle: 'e',
        dx: -500,
        dy: 0,
        bounds,
        aspect: null,
        minSize: 20,
      })
    ).toEqual({x: 100, y: 100, width: 20, height: 100});
  });

  it('keeps the aspect ratio when resizing corners', () => {
    const result = resizeCrop({
      start,
      handle: 'se',
      dx: 100,
      dy: 0,
      bounds,
      aspect: 2,
    });
    expect(result).toEqual({x: 100, y: 100, width: 300, height: 150});

    // The opposite corner stays anchored.
    const nw = resizeCrop({
      start,
      handle: 'nw',
      dx: -40,
      dy: 0,
      bounds,
      aspect: 2,
    });
    expect(nw).toEqual({x: 60, y: 80, width: 240, height: 120});
  });

  it('keeps the aspect ratio within the bounds', () => {
    const result = resizeCrop({
      start,
      handle: 'se',
      dx: 5000,
      dy: 5000,
      bounds,
      aspect: 2,
    });
    // Limited by the bottom edge: height 400 => width 800.
    expect(result).toEqual({x: 100, y: 100, width: 800, height: 400});
  });

  it('grows edges from the center with an aspect ratio', () => {
    const result = resizeCrop({
      start,
      handle: 'e',
      dx: 100,
      dy: 0,
      bounds,
      aspect: 2,
    });
    expect(result).toEqual({x: 100, y: 75, width: 300, height: 150});

    const south = resizeCrop({
      start,
      handle: 's',
      dx: 0,
      dy: 50,
      bounds,
      aspect: 2,
    });
    expect(south).toEqual({x: 50, y: 100, width: 300, height: 150});
  });
});

describe('roundCrop', () => {
  it('rounds to whole pixels matching the aspect ratio', () => {
    expect(
      roundCrop({x: 10.4, y: 20.6, width: 160.2, height: 90.1}, bounds, 16 / 9)
    ).toEqual({x: 10, y: 21, width: 160, height: 90});
  });

  it('stays within the bounds', () => {
    expect(
      roundCrop({x: 0, y: 0, width: 1000.4, height: 500.4}, bounds, null)
    ).toEqual({x: 0, y: 0, width: 1000, height: 500});
  });
});
