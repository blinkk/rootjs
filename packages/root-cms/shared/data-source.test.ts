import {describe, it, expect} from 'vitest';
import {
  isGridDataFormat,
  marshalDataSourceData,
  marshalGridData,
  normalizeDataFormat,
  unmarshalDataSourceData,
  unmarshalGridData,
} from './data-source.js';

describe('isGridDataFormat', () => {
  it('returns true for grid formats', () => {
    expect(isGridDataFormat('grid')).toBe(true);
    expect(isGridDataFormat('array')).toBe(true);
  });

  it('returns false for other formats', () => {
    expect(isGridDataFormat('map')).toBe(false);
    expect(isGridDataFormat(undefined)).toBe(false);
  });
});

describe('normalizeDataFormat', () => {
  it('converts the deprecated array alias to grid', () => {
    expect(normalizeDataFormat('array')).toBe('grid');
    expect(normalizeDataFormat('grid')).toBe('grid');
  });

  it('defaults to map', () => {
    expect(normalizeDataFormat('map')).toBe('map');
    expect(normalizeDataFormat(undefined)).toBe('map');
  });
});

describe('marshalGridData', () => {
  it('converts a 2d array into firestore-safe maps', () => {
    expect(
      marshalGridData([
        ['header1', 'header2'],
        ['foo', 'bar'],
      ])
    ).toEqual([{cells: ['header1', 'header2']}, {cells: ['foo', 'bar']}]);
  });

  it('never nests an array directly within an array', () => {
    const stored = marshalGridData([['foo'], ['bar']]);
    expect(Array.isArray(stored)).toBe(true);
    for (const row of stored) {
      expect(Array.isArray(row)).toBe(false);
      expect(Array.isArray(row.cells)).toBe(true);
      for (const cell of row.cells) {
        expect(typeof cell).toBe('string');
      }
    }
  });

  it('pads rows to the width of the widest row', () => {
    expect(
      marshalGridData([['header1', 'header2', 'header3'], ['foo', 'bar'], []])
    ).toEqual([
      {cells: ['header1', 'header2', 'header3']},
      {cells: ['foo', 'bar', '']},
      {cells: ['', '', '']},
    ]);
  });

  it('coerces cell values to strings', () => {
    expect(marshalGridData([[1, true, null, undefined, 'foo']])).toEqual([
      {cells: ['1', 'true', '', '', 'foo']},
    ]);
  });

  it('passes through rows that are already marshaled', () => {
    const stored = marshalGridData([
      ['header1', 'header2'],
      ['foo', 'bar'],
    ]);
    expect(marshalGridData(stored)).toEqual(stored);
  });

  it('handles empty data', () => {
    expect(marshalGridData([])).toEqual([]);
  });
});

describe('unmarshalGridData', () => {
  it('converts stored maps back into a 2d array', () => {
    expect(
      unmarshalGridData([
        {cells: ['header1', 'header2']},
        {cells: ['foo', 'bar']},
      ])
    ).toEqual([
      ['header1', 'header2'],
      ['foo', 'bar'],
    ]);
  });

  it('returns an empty array for empty or non-array data', () => {
    expect(unmarshalGridData([])).toEqual([]);
    expect(unmarshalGridData(null)).toEqual([]);
    expect(unmarshalGridData('foo')).toEqual([]);
  });

  it('returns an empty row for malformed rows', () => {
    expect(unmarshalGridData([null, {}, {cells: ['foo']}])).toEqual([
      [],
      [],
      ['foo'],
    ]);
  });

  it('round-trips grid data through firestore storage', () => {
    const grid = [
      ['name', 'meal'],
      ['grogu', 'frog'],
      ['mando', 'soup'],
    ];
    expect(unmarshalGridData(marshalGridData(grid))).toEqual(grid);
  });
});

describe('marshalDataSourceData', () => {
  it('marshals grid formats', () => {
    const grid = [
      ['header1', 'header2'],
      ['foo', 'bar'],
    ];
    const stored = [{cells: ['header1', 'header2']}, {cells: ['foo', 'bar']}];
    expect(marshalDataSourceData('grid', grid)).toEqual(stored);
    expect(marshalDataSourceData('array', grid)).toEqual(stored);
  });

  it('returns other formats as-is', () => {
    const mapData = [{header1: 'foo', header2: 'bar'}];
    expect(marshalDataSourceData('map', mapData)).toBe(mapData);
    expect(marshalDataSourceData(undefined, mapData)).toBe(mapData);
  });

  it('returns non-array values as-is', () => {
    expect(marshalDataSourceData('grid', null)).toBe(null);
    expect(marshalDataSourceData('grid', 'foo')).toBe('foo');
  });
});

describe('unmarshalDataSourceData', () => {
  it('unmarshals grid formats', () => {
    const stored = [{cells: ['header1', 'header2']}, {cells: ['foo', 'bar']}];
    const grid = [
      ['header1', 'header2'],
      ['foo', 'bar'],
    ];
    expect(unmarshalDataSourceData('grid', stored)).toEqual(grid);
    expect(unmarshalDataSourceData('array', stored)).toEqual(grid);
  });

  it('returns other formats as-is', () => {
    const mapData = [{header1: 'foo', header2: 'bar'}];
    expect(unmarshalDataSourceData('map', mapData)).toBe(mapData);
    expect(unmarshalDataSourceData(undefined, mapData)).toBe(mapData);
  });

  it('returns non-array values as-is', () => {
    expect(unmarshalDataSourceData('grid', null)).toBe(null);
    expect(unmarshalDataSourceData('grid', 'foo')).toBe('foo');
  });
});
