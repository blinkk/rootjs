export interface GoogleSheetId {
  spreadsheetId: string;
  gid: number;
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
    return `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}/edit`;
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

  private setSpreadsheet(spreadsheet: gapi.client.sheets.Spreadsheet) {
    this.spreadsheet = spreadsheet;
    if (this.spreadsheet.sheets) {
      this.sheets = this.spreadsheet.sheets.map((sheet) => {
        const gid = sheet.properties?.sheetId as number;
        const gsheet = new GSheet(this, gid);
        gsheet.setSheet(sheet);
        return gsheet;
      });
    }
  }

  private async fetchSheets() {
    // TODO(stevenle): impl.
  }
}

export class GSheet {
  readonly spreadsheet: GSpreadsheet;
  readonly gid: number;
  sheet?: gapi.client.sheets.Sheet;

  constructor(spreadsheet: GSpreadsheet, gid: number) {
    this.spreadsheet = spreadsheet;
    this.gid = gid;
  }

  setSheet(sheet: gapi.client.sheets.Spreadsheet) {
    this.sheet = sheet;
  }
}
