export interface GoogleSheetId {
  spreadsheetId: string;
  gid?: number;
}

export interface GSpreadsheetCreateOptions {
  title?: string;
}

export class GSpreadsheet {
  readonly spreadsheetId: string;
  private spreadsheet?: gapi.client.sheets.Spreadsheet;
  private sheets?: GSheet[];

  constructor(spreadsheetId: string) {
    this.spreadsheetId = spreadsheetId;
  }

  /**
   * Creates a new Google Spreadsheet.
   */
  static async create(options: GSpreadsheetCreateOptions) {
    const req: any = {
      fields: 'spreadsheetId',
    };
    if (options?.title) {
      req.resource = {
        properties: {
          title: options.title,
        },
      };
    }
    const res = await gapi.client.sheets.spreadsheets.create(req);
    const spreadsheet = res.result;
    const gspreadsheet = new GSpreadsheet(spreadsheet.spreadsheetId!);
    gspreadsheet.setSpreadsheet(spreadsheet);
    return gspreadsheet;
  }

  getUrl() {
    return getSpreadsheetUrl({spreadsheetId: this.spreadsheetId});
  }

  async getSheet(gid: number) {
    if (!this.sheets) {
      await this.fetchSheets();
    }
    if (this.sheets) {
      for (let i = 0; i < this.sheets.length; i++) {
        if (this.sheets[i].gid === gid) {
          return this.sheets[i];
        }
      }
    }
    return null;
  }

  private async fetchSheets() {
    const res = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: 'sheets.properties',
    });
    const spreadsheet = res.result;
    this.setSpreadsheet(spreadsheet);
  }

  private setSpreadsheet(spreadsheet: gapi.client.sheets.Spreadsheet) {
    this.spreadsheet = spreadsheet;
    if (this.spreadsheet.sheets) {
      this.setSheets(this.spreadsheet.sheets);
    }
  }

  private setSheets(sheets: gapi.client.sheets.Sheet[]) {
    const gsheets: GSheet[] = [];
    sheets.forEach((sheet) => {
      const sheetGid = sheet.properties?.sheetId as number;
      const title = sheet.properties?.title as string;
      const gsheet = new GSheet(this, sheetGid ?? 0, title);
      gsheets.push(gsheet);
    });
    this.sheets = gsheets;
  }
}

export class GSheet {
  readonly spreadsheet: GSpreadsheet;
  readonly gid: number;
  title: string;

  constructor(spreadsheet: GSpreadsheet, gid: number, title: string) {
    this.spreadsheet = spreadsheet;
    this.gid = gid;
    this.title = title;
  }

  /**
   * Updates rows to the sheet. Rows are keyed by a specific column. Any new
   * rows will be added to the end of the sheet.
   *
   * For example, if the existing sheet is:
   *
   * ```
   * key  |  col_a  |  col_b
   * foo  |  foo1   |  foo2
   * bar  |  bar1   |  bar2
   * ```
   *
   * After running:
   *
   * ```
   * gsheet.updateValuesMap(
   *   [
   *     {key: 'baz', col_a: 'new1', col_b: 'new2'}
   *     {key: 'foo', col_a: 'new3', col_b: 'new4'},
   *   ],
   *   'key'
   * );
   * ```
   *
   * The sheet will update to:
   *
   * ```
   * key  |  col_a  |  col_b
   * foo  |  new3   |  new4
   * bar  |  bar1   |  bar2
   * baz  |  new1   |  new2
   * ```
   */
  async updateValuesMap(
    valuesMap: Array<Record<string, string>>,
    options: {
      /** Column name that identifies each row. */
      keyedBy: string;
      /** If provided, these columns will not be overwritten if there is an existing value. */
      preserveColumns?: string[];
    }
  ) {
    const keyedBy = options.keyedBy;
    const preserveColumns = options.preserveColumns || [];
    if (!keyedBy) {
      throw new Error('missing "keyedBy" argument');
    }

    // Fetch current sheet values.
    const [initialHeaders, initialRows] = await this.getValues();
    const headers = [...initialHeaders];

    // Represent the changes to the sheet as a 2d array, storing whether or not
    // the cell's value has changed and its text value.
    const sheetCellValues: Array<Array<{hasChanges: boolean; value: string}>> =
      [];

    // Add header row.
    let keyedByColIndex = -1;
    const preserveColumnsIndexes: Set<number> = new Set();
    sheetCellValues.push(
      initialHeaders.map((header, colIndex) => {
        if (header === keyedBy) {
          keyedByColIndex = colIndex;
        }
        if (preserveColumns.includes(header)) {
          preserveColumnsIndexes.add(colIndex);
        }
        return {hasChanges: false, value: header};
      })
    );

    function addHeaderCol(name: string) {
      sheetCellValues[0].push({hasChanges: true, value: name});
      headers.push(name);
    }

    // If the "keyedBy" column doesn't exist, add it.
    if (keyedByColIndex === -1) {
      addHeaderCol(keyedBy);
    }

    // Maintain an index of the "keyedBy" row numbers.
    const rowIndexMap: Record<string, number> = {};

    // Add initial row values with `{hasChanges: false}`.
    initialRows.forEach((row, i) => {
      const rowIndex = i + 1; // Add 1 to account for the header row.
      sheetCellValues.push(
        row.map((cellValue, colIndex) => {
          if (colIndex === keyedByColIndex && cellValue) {
            if (cellValue in rowIndexMap) {
              // When there are multiple rows with the same keyedBy value,
              // only update the first row.
              console.warn(`multiple rows keyed by "${cellValue}"`);
            } else {
              rowIndexMap[cellValue] = rowIndex;
            }
          }
          return {hasChanges: false, value: cellValue};
        })
      );
    });

    /**
     * Converts a row from a key-value map to an array of strings based on
     * sheet's column headers.
     *
     * NOTE(stevenle): null values are used to distinguish between whether the
     * cell's original value should be preserved vs. clearing the value of the
     * cell.
     */
    function mapToArrayValues(row: Record<string, string>) {
      for (const key in row) {
        if (!headers.includes(key)) {
          addHeaderCol(key);
        }
      }
      const values = headers.map((key) => row[key] ?? null);
      return values;
    }

    // Add new values to `sheetUpdates`.
    valuesMap.forEach((row) => {
      const values = mapToArrayValues(row);
      const keyedByValue = row[keyedBy];

      // Get the row index using the "keyedBy" column value. Note that
      // `rowIndex` should be >0 since the header row is first.
      const rowIndex = rowIndexMap[keyedByValue];
      if (rowIndex) {
        // Update the existing row with new values, marking changes with
        // `{hasChanges: true}`. When only cells with changes are updated, any
        // previous formulas used in other cells are preserved without
        // accidental overwrites.
        const sheetUpdatesRow = sheetCellValues[rowIndex];
        values.map((value, colIndex) => {
          if (colIndex >= sheetUpdatesRow.length) {
            sheetUpdatesRow.push({
              hasChanges: true,
              value: value || '',
            });
          } else if (
            value !== null &&
            sheetUpdatesRow[colIndex].value !== value
          ) {
            // Only update the cell if the column isn't in `preserveColumns` or
            // if the cell is empty.
            if (
              !preserveColumnsIndexes.has(colIndex) ||
              !sheetUpdatesRow[colIndex].value
            ) {
              sheetUpdatesRow[colIndex] = {
                hasChanges: true,
                value: value,
              };
            }
          }
        });
      } else {
        // No existing row matching the "keyedBy" column, append values to the
        // end of the sheet.
        sheetCellValues.push(
          values.map((value) => {
            return {hasChanges: !!value, value: value || ''};
          })
        );
      }
    });

    // Resize the spreadsheet if necessary.
    const numCols = headers.length;
    const numRows = sheetCellValues.length;
    const initialColCount = initialHeaders.length;
    const initialRowCount = initialRows.length + 1;
    if (numCols > initialColCount || numRows > initialRowCount) {
      await this.resizeSheet({numCols: numCols + 2, numRows: numRows + 20});
    }

    // Update all changed cells.
    const gapiSheetUpdates: gapi.client.sheets.ValueRange[] = [];

    sheetCellValues.forEach((row, rowIndex) => {
      // Remove all cells at the end of rows that do not have changes.
      while (row.length > 0 && row.at(-1)?.hasChanges === false) {
        row.pop();
      }
      if (row.length === 0) {
        return;
      }

      // If all the cells in the row has been changed, update the row in a
      // single batch.
      if (row.every((cell) => cell.hasChanges)) {
        gapiSheetUpdates.push({
          range: `${this.title}!A${rowIndex + 1}`,
          majorDimension: 'ROWS',
          values: [row.map((cell) => cell.value || '')],
        });
        return;
      }

      // When the row has a mix of changed and unchanged cells, each cell
      // should be updated one-by-one.
      row.forEach((cell, colIndex) => {
        if (cell.hasChanges) {
          const colLetter = getColumnLetter(colIndex);
          gapiSheetUpdates.push({
            range: `${this.title}!${colLetter}${rowIndex + 1}`,
            majorDimension: 'ROWS',
            values: [[cell.value || '']],
          });
        }
      });
    });

    // TODO(stevenle): for massive spreadsheets, we may need to split these
    // requests into multiple chunks to avoid limits.
    if (gapiSheetUpdates.length > 0) {
      await gapi.client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheet.spreadsheetId,
        resource: {
          data: gapiSheetUpdates,
          valueInputOption: 'RAW',
        },
      });
    }
  }

  /**
   * Replaces the contents of the sheet with an array of data.
   *
   * Example:
   *
   * ```
   * gsheet.replaceSheet(
   *   [
   *     {col_a: 'foo', col_b: 'bar'},
   *     {col_a: 'baz', col_b: 'qux'},
   *   ],
   *   ['col_a', 'col_b']
   * );
   * ```
   *
   * =>
   *
   * ```
   * col_a  |  col_b
   * foo    |  bar
   * baz    |  qux
   * ```
   */
  async replaceSheet(headers: string[], rows: Array<Record<string, string>>) {
    const numCols = headers.length;
    const numRows = rows.length + 1;

    // Format cells as a 2d grid of strings.
    const cells: string[][] = [];
    // Add header row.
    cells.push(headers);
    // Add rows.
    cells.push(
      ...rows.map((row) => {
        // TODO(stevenle): escape the input so that the cells are stored as
        // raw strings.
        return headers.map((key) => row[key] || '');
      })
    );

    // Resize the sheet.
    await this.resizeSheet({numCols: numCols + 2, numRows: numRows + 20});

    // Update cell values.
    console.log('updating cell values');
    const endCol = getColumnLetter(numCols - 1);
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheet.spreadsheetId,
      range: `${this.title}!A1:${endCol}${numRows}`,
      valueInputOption: 'RAW',
      resource: {
        range: `${this.title}!A1:${endCol}${numRows}`,
        majorDimension: 'ROWS',
        values: cells,
      },
    });
  }

  async resizeSheet(options: {numCols?: number; numRows?: number}) {
    console.log('resizing sheet');
    const gridProperties: gapi.client.sheets.GridProperties = {};
    if (options.numCols) {
      gridProperties.columnCount = options.numCols;
    }
    if (options.numRows) {
      gridProperties.rowCount = options.numRows;
    }
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheet.spreadsheetId,
      resource: {
        requests: [
          {
            updateSheetProperties: {
              properties: {
                gridProperties: gridProperties,
              },
              fields: 'gridProperties',
            },
          },
        ],
      },
    });
  }

  /**
   * Returns the sheet's column headers and row values as an 2d array of
   * strings.
   */
  async getValues() {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheet.spreadsheetId,
      range: this.title,
    });
    const values = res.result.values as string[][];
    const headers = values[0];
    const rows = values.slice(1);
    return [headers, rows] as const;
  }

  /**
   * Returns the sheet values as an array of objects.
   */
  async getValuesMap(): Promise<Array<Record<string, string>>> {
    const [headers, rows] = await this.getValues();
    const results = rows.map((row) => {
      const data: Record<string, string> = {};
      row.forEach((value, i) => {
        const key = headers[i];
        if (key) {
          data[key] = String(value || '');
        }
      });
      return data;
    });
    return results;
  }

  /**
   * Updates the tab title of the sheet.
   */
  async setTitle(title: string) {
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheet.spreadsheetId,
      resource: {
        requests: [
          {
            updateSheetProperties: {
              properties: {
                title: title,
                sheetId: this.gid,
              },
              fields: 'title',
            },
          },
        ],
      },
    });
    this.title = title;
  }

  getUrl() {
    return getSpreadsheetUrl({
      spreadsheetId: this.spreadsheet.spreadsheetId,
      gid: this.gid,
    });
  }

  async applyL10nTheme() {
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheet.spreadsheetId,
      resource: {
        requests: [
          // Set font to 11pt Ubuntu.
          {
            repeatCell: {
              range: {
                sheetId: this.gid,
                startRowIndex: 0,
              },
              cell: {
                userEnteredFormat: {
                  textFormat: {
                    fontFamily: 'Ubuntu',
                    fontSize: 10,
                  },
                },
              },
              fields: 'userEnteredFormat(textFormat)',
            },
          },
          // Bold the header row.
          {
            repeatCell: {
              range: {
                sheetId: this.gid,
                startRowIndex: 0,
                endRowIndex: 1,
              },
              cell: {
                userEnteredFormat: {
                  textFormat: {
                    bold: true,
                    fontFamily: 'Ubuntu',
                    fontSize: 10,
                  },
                },
              },
              fields: 'userEnteredFormat(textFormat)',
            },
          },
          // Freeze the header row.
          {
            updateSheetProperties: {
              properties: {
                sheetId: this.gid,
                gridProperties: {
                  frozenRowCount: 1,
                },
              },
              fields: 'gridProperties.frozenRowCount',
            },
          },
          // Set column widths.
          {
            updateDimensionProperties: {
              range: {
                sheetId: this.gid,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: 1,
              },
              properties: {
                pixelSize: 320,
              },
              fields: 'pixelSize',
            },
          },
          // {
          //   updateDimensionProperties: {
          //     range: {
          //       sheetId: this.gid,
          //       dimension: 'COLUMNS',
          //       startIndex: 1,
          //       endIndex: 2,
          //     },
          //     properties: {
          //       pixelSize: 70,
          //     },
          //     fields: 'pixelSize',
          //   },
          // },
          {
            updateDimensionProperties: {
              range: {
                sheetId: this.gid,
                dimension: 'COLUMNS',
                startIndex: 1,
              },
              properties: {
                pixelSize: 320,
              },
              fields: 'pixelSize',
            },
          },
          // Set text wrapping.
          {
            repeatCell: {
              range: {
                sheetId: this.gid,
                startRowIndex: 1,
                startColumnIndex: 0,
              },
              cell: {
                userEnteredFormat: {
                  wrapStrategy: 'WRAP',
                },
              },
              fields: 'userEnteredFormat(wrapStrategy)',
            },
          },
        ],
      },
    });
  }
}

/**
 * Returns a Google Sheets URL for a given spreadsheet id, e.g.:
 * https://docs.google.com/spreadsheets/d/<spreadsheetId>/edit#gid=<gid>
 */
export function getSpreadsheetUrl(sheetId: GoogleSheetId) {
  const spreadsheetId = sheetId.spreadsheetId;
  const segments = [
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  ];
  if (typeof sheetId.gid === 'number') {
    segments.push(`#gid=${sheetId.gid}`);
  }
  return segments.join('');
}

/**
 * Parses a Google Sheets URL and returns its component ids.
 */
export function parseSpreadsheetUrl(url: string): GoogleSheetId {
  // For now, do a naive parsing where we assume the format of the url is
  // something like:
  // https://docs.google.com/spreadsheets/d/<spreadsheetId>/edit#gid=<gid>
  const parts = url.split('/');
  const spreadsheetId = parts[parts.length - 2];
  const hash = url.slice(url.indexOf('#'));
  const gidMatch = hash.match(/gid=(\d+)/);
  let gid = 0;
  if (gidMatch && gidMatch[1]) {
    gid = parseInt(gidMatch[1]);
  }
  return {spreadsheetId: spreadsheetId, gid: gid};
}

/**
 * Converts a 0-indexed number to a column letter, e.g. `A`, `B`, etc. After
 * `Z`, the letters loop back around to `AA`, `AB`, etc.
 */
function getColumnLetter(index: number) {
  const letters = [];
  while (index >= 0) {
    const current = index % 26;
    letters.push(String.fromCharCode(current + 65));
    index = (index - current - 1) / 26;
  }
  return letters.reverse().join('');
}
