import {describe, expect, it} from 'vitest';
import {diffDataTables, toDataTable} from './data-source-diff.js';

describe('diffDataTables', () => {
  const headers = ['slot', 'headline'];

  it('returns no rows for identical tables', () => {
    const table = {headers, rows: [['hero', 'Hello']]};
    const diff = diffDataTables(table, table);
    expect(diff.rows).toEqual([]);
    expect([diff.added, diff.removed, diff.changed]).toEqual([0, 0, 0]);
  });

  it('pairs edited rows as changed and keeps inserted rows aligned', () => {
    const before = {
      headers,
      rows: [
        ['hero', 'Fall essentials'],
        ['banner-1', 'Free shipping'],
        ['banner-2', 'Gift guide'],
      ],
    };
    const after = {
      headers,
      rows: [
        ['hero', 'New lineup'],
        ['banner-new', 'Student discount'],
        ['banner-1', 'Free shipping'],
      ],
    };
    const diff = diffDataTables(before, after);
    expect(diff.rows).toEqual([
      {
        type: 'changed',
        index: 0,
        cells: [
          {value: 'hero'},
          {value: 'New lineup', oldValue: 'Fall essentials'},
        ],
      },
      {
        type: 'added',
        index: 1,
        cells: [{value: 'banner-new'}, {value: 'Student discount'}],
      },
      {
        type: 'removed',
        index: 2,
        cells: [{value: 'banner-2'}, {value: 'Gift guide'}],
      },
    ]);
    expect([diff.added, diff.removed, diff.changed]).toEqual([1, 1, 1]);
  });

  it('aligns columns by header when headers change', () => {
    const before = {headers: ['b', 'a'], rows: [['2', '1']]};
    const after = {headers: ['a', 'b', 'c'], rows: [['1', '2', '3']]};
    const diff = diffDataTables(before, after);
    expect(diff.headers).toEqual(['a', 'b', 'c']);
    expect(diff.rows).toEqual([
      {
        type: 'changed',
        index: 0,
        cells: [{value: '1'}, {value: '2'}, {value: '3', oldValue: ''}],
      },
    ]);
  });
});

describe('toDataTable', () => {
  it('converts map and grid data', () => {
    expect(toDataTable('map', [{a: '1', b: '2'}, {b: '3'}])).toEqual({
      headers: ['a', 'b'],
      rows: [
        ['1', '2'],
        ['', '3'],
      ],
    });
    expect(
      toDataTable('grid', [
        ['a', 'b'],
        ['1', '2'],
      ])
    ).toEqual({headers: ['a', 'b'], rows: [['1', '2']]});
  });
});
