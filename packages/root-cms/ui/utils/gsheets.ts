// Chars for the column headers used in a sheet.
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

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

  get spreadsheetUrl() {
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
  readonly title: string;

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
   * updateRows(
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
  async updateRows(rows: Array<Record<string, string>>, keyedBy: string) {
    // TODO(stevenle): implement.
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
    console.log('resizing sheet');
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheet.spreadsheetId,
      resource: {
        requests: [
          {
            updateSheetProperties: {
              properties: {
                gridProperties: {
                  columnCount: numCols + 2,
                  rowCount: numRows + 20,
                },
              },
              fields: 'gridProperties',
            },
          },
        ],
      },
    });

    // Update cell values.
    console.log('updating cell values');
    const endCol = ALPHA[numCols - 1];
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

  async getValues(): Promise<Array<Record<string, string>>> {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheet.spreadsheetId,
      range: this.title,
    });
    const values = res.result.values as string[][];
    const headers = values[0];
    const rows = values.slice(1);
    const results = rows.map((row) => {
      const data: Record<string, string> = {};
      row.forEach((value, i) => {
        const key = headers[i];
        data[key] = String(value || '');
      });
      return data;
    });
    return results;
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
