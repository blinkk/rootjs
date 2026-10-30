import {diffArrays} from 'diff';
import type {GsheetDataFormat} from '../../../shared/data-source.js';

/** A data source's synced rows as a table of strings. */
export interface DataTable {
  headers: string[];
  rows: string[][];
}

/** A cell in a diffed row. */
export interface DataTableDiffCell {
  value: string;
  /** The published value, set only when a changed row's cell differs. */
  oldValue?: string;
}

/** A row that was added, removed or changed between two tables. */
export interface DataTableDiffRow {
  type: 'added' | 'removed' | 'changed';
  /**
   * The row's 0-based index among the data rows (excluding the header row),
   * in the new table, or in the old table for removed rows.
   */
  index: number;
  cells: DataTableDiffCell[];
}

/** The differences between two versions of a data table. */
export interface DataTableDiff {
  /** The new table's headers, then any headers only the old table has. */
  headers: string[];
  /** Only the rows that differ, in table order. */
  rows: DataTableDiffRow[];
  added: number;
  removed: number;
  changed: number;
}

/**
 * Converts a gsheet data source's synced data into a table. `map` data is an
 * array of objects keyed by header, `grid` data is an array of rows whose
 * first row is the header row.
 */
export function toDataTable(
  dataFormat: GsheetDataFormat | undefined,
  data: unknown,
  storedHeaders?: string[]
): DataTable {
  if (!Array.isArray(data)) {
    return {headers: storedHeaders || [], rows: []};
  }
  if (dataFormat === 'grid') {
    const grid = data as string[][];
    return {
      headers: storedHeaders || grid[0] || [],
      rows: grid.slice(1).map((row) => row.map((cell) => String(cell ?? ''))),
    };
  }
  const items = data as Array<Record<string, unknown>>;
  let headers = storedHeaders;
  if (!headers) {
    // Preserve key order by collecting keys as they are encountered.
    const headersSet = new Set<string>();
    items.forEach((item) => {
      for (const key in item) {
        if (key) {
          headersSet.add(key);
        }
      }
    });
    headers = Array.from(headersSet);
  }
  const rows = items.map((item) =>
    headers!.map((header) => String(item[header] ?? ''))
  );
  return {headers, rows};
}

/**
 * Diffs two versions of a data table row by row. Unchanged rows are matched
 * using a longest-common-subsequence diff, so inserting or deleting a row
 * doesn't mark every row after it as changed. A run of removed rows followed
 * by a run of added rows is paired up as changed rows, cell by cell.
 */
export function diffDataTables(
  before: DataTable,
  after: DataTable
): DataTableDiff {
  const headers = [...after.headers];
  before.headers.forEach((header) => {
    if (!headers.includes(header)) {
      headers.push(header);
    }
  });
  const beforeRows = projectRows(before, headers);
  const afterRows = projectRows(after, headers);
  const parts = diffArrays(
    beforeRows.map((row) => JSON.stringify(row)),
    afterRows.map((row) => JSON.stringify(row))
  );

  const result: DataTableDiff = {
    headers,
    rows: [],
    added: 0,
    removed: 0,
    changed: 0,
  };
  let beforeIndex = 0;
  let afterIndex = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const count = part.value.length;
    if (!part.added && !part.removed) {
      beforeIndex += count;
      afterIndex += count;
      continue;
    }
    if (part.removed) {
      const next = parts[i + 1];
      const addedCount = next?.added ? next.value.length : 0;
      const pairedCount = Math.min(count, addedCount);
      for (let j = 0; j < pairedCount; j++) {
        const oldRow = beforeRows[beforeIndex + j];
        const newRow = afterRows[afterIndex + j];
        result.rows.push({
          type: 'changed',
          index: afterIndex + j,
          cells: newRow.map((value, k) =>
            value === oldRow[k] ? {value} : {value, oldValue: oldRow[k]}
          ),
        });
        result.changed += 1;
      }
      for (let j = pairedCount; j < count; j++) {
        result.rows.push({
          type: 'removed',
          index: beforeIndex + j,
          cells: beforeRows[beforeIndex + j].map((value) => ({value})),
        });
        result.removed += 1;
      }
      for (let j = pairedCount; j < addedCount; j++) {
        result.rows.push({
          type: 'added',
          index: afterIndex + j,
          cells: afterRows[afterIndex + j].map((value) => ({value})),
        });
        result.added += 1;
      }
      beforeIndex += count;
      afterIndex += addedCount;
      if (addedCount > 0) {
        // The added part was consumed above.
        i += 1;
      }
      continue;
    }
    // An added part that doesn't follow a removed part.
    for (let j = 0; j < count; j++) {
      result.rows.push({
        type: 'added',
        index: afterIndex + j,
        cells: afterRows[afterIndex + j].map((value) => ({value})),
      });
      result.added += 1;
    }
    afterIndex += count;
  }
  return result;
}

/** Reorders each row's cells to match `headers`, filling gaps with "". */
function projectRows(table: DataTable, headers: string[]): string[][] {
  const columnIndexes = headers.map((header) => table.headers.indexOf(header));
  return table.rows.map((row) =>
    columnIndexes.map((i) => (i === -1 ? '' : (row[i] ?? '')))
  );
}
