/**
 * Shared helpers for csv-style data source formats (e.g. a Google Sheet).
 * These are pure functions with no Firebase dependency so they can run on both
 * the client and the server.
 *
 * Firestore doesn't allow an array to be nested directly within another array,
 * so `grid` data is stored as an array of `{cells: string[]}` maps. Data is
 * marshaled on write and unmarshaled on read so that callers always work with
 * a plain `string[][]`.
 */

/**
 * Format used to store data synced from a csv-style data source.
 *
 * - `map`: an array of objects keyed by the sheet's header row, e.g.
 *   `[{header1: 'foo', header2: 'bar'}]`.
 * - `grid`: an array of arrays of strings, including the header row, e.g.
 *   `[['header1', 'header2'], ['foo', 'bar']]`.
 */
export type GsheetDataFormat = 'map' | 'grid';

/**
 * A single row of `grid` data as stored in Firestore. Rows are wrapped in a map
 * because Firestore doesn't support arrays nested directly within arrays.
 */
export interface DataSourceGridRow {
  cells: string[];
}

/**
 * Converts an array of arrays of strings into the Firestore-safe representation
 * used to store `grid` data. Cell values are coerced to strings and rows are
 * padded so that every row has the same number of cells, e.g.:
 *
 * ```
 * marshalGridData([['header1', 'header2'], ['foo']]);
 * // => [{cells: ['header1', 'header2']}, {cells: ['foo', '']}]
 * ```
 *
 * Rows that are already in the stored `{cells}` format are passed through,
 * which makes the function safe to call on data that's being copied from one
 * doc to another (e.g. when publishing).
 */
export function marshalGridData(rows: any[]): DataSourceGridRow[] {
  const grid = rows.map((row) => toCells(row));
  const width = grid.reduce((max, cells) => Math.max(max, cells.length), 0);
  return grid.map((cells) => {
    while (cells.length < width) {
      cells.push('');
    }
    return {cells};
  });
}

/**
 * Converts `grid` data stored in Firestore back into an array of arrays of
 * strings, e.g.:
 *
 * ```
 * unmarshalGridData([{cells: ['header1', 'header2']}, {cells: ['foo', 'bar']}]);
 * // => [['header1', 'header2'], ['foo', 'bar']]
 * ```
 */
export function unmarshalGridData(data: any): string[][] {
  if (!Array.isArray(data)) {
    return [];
  }
  return data.map((row) => toCells(row));
}

/**
 * Converts data into the format stored in Firestore for a given data format.
 * Non-grid formats are returned as-is.
 */
export function marshalDataSourceData(
  dataFormat: string | undefined,
  data: any
) {
  if (dataFormat !== 'grid' || !Array.isArray(data)) {
    return data;
  }
  return marshalGridData(data);
}

/**
 * Converts data read from Firestore into the format callers expect for a given
 * data format. Non-grid formats are returned as-is.
 */
export function unmarshalDataSourceData(
  dataFormat: string | undefined,
  data: any
) {
  if (dataFormat !== 'grid' || !Array.isArray(data)) {
    return data;
  }
  return unmarshalGridData(data);
}

/** Returns true if the value looks like a stored grid row, e.g. `{cells: []}`. */
function isGridRow(value: any): value is DataSourceGridRow {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray(value.cells)
  );
}

/** Converts a row in either representation into an array of cell values. */
function toCells(row: any): string[] {
  if (isGridRow(row)) {
    return row.cells.map(toCellValue);
  }
  if (Array.isArray(row)) {
    return row.map(toCellValue);
  }
  return [];
}

/** Coerces a cell value to a string. */
function toCellValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}
