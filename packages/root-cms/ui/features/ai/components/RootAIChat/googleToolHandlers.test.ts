import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  diffSheetUpdates,
  executeGoogleWriteTool,
  extractDocParagraphs,
  parseA1Range,
  previewGoogleWriteTool,
  resolveSheetUpdates,
  simulateTextEdits,
} from './googleToolHandlers.js';

vi.mock('../../../../integrations/google-auth.js', () => ({
  GOOGLE_WRITE_SCOPES: ['https://www.googleapis.com/auth/drive'],
  clearGoogleAccessToken: vi.fn(),
  ensureGoogleAccessToken: vi.fn(async () => 'test-token'),
  getGoogleAccessToken: vi.fn(() => 'test-token'),
  isGoogleApiEnabled: vi.fn(() => true),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const SHEET_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz';
const TABS = [
  {gid: 0, title: 'Sheet1'},
  {gid: 42, title: "Bob's tab"},
];

describe('parseA1Range', () => {
  it('parses cells, ranges, quoted tabs and whole rows/columns', () => {
    expect(parseA1Range('C5')).toEqual({start: {row: 4, col: 2}});
    expect(parseA1Range('Sheet2!AA10:AB12')).toEqual({
      tab: 'Sheet2',
      start: {row: 9, col: 26},
    });
    expect(parseA1Range("'Bob''s tab'!$B$2")).toEqual({
      tab: "Bob's tab",
      start: {row: 1, col: 1},
    });
    expect(parseA1Range('D:D')).toEqual({start: {row: 0, col: 3}});
    expect(parseA1Range('7:7')).toEqual({start: {row: 6, col: 0}});
    expect(parseA1Range('not a range')).toBeNull();
    expect(parseA1Range('!A1')).toBeNull();
  });
});

describe('sheet updates', () => {
  it('resolves ranges to exact tab-qualified ranges and diffs changed cells', () => {
    const updates = resolveSheetUpdates(
      [
        {range: 'B2', values: [['hola', 'bonjour'], ['adiós']]},
        {range: "'Bob''s tab'!A1", values: [['x']]},
      ],
      TABS,
      TABS[0]
    );
    expect(updates.map((u) => u.range)).toEqual([
      "'Sheet1'!B2:C3",
      "'Bob''s tab'!A1:A1",
    ]);

    const changes = diffSheetUpdates(updates, [
      // B2 is unchanged; C2 and B3 change.
      [['hola', 'salut'], []],
      [['x']],
    ]);
    expect(changes).toEqual([
      {cell: 'Sheet1!C2', before: 'salut', after: 'bonjour'},
      {cell: 'Sheet1!B3', before: '', after: 'adiós'},
    ]);
  });

  it('previews and applies a batch update with the user token', async () => {
    const fetchMock = vi.fn(async (url: string, init?: any) => {
      if (url.startsWith('https://www.googleapis.com/drive/v3/files/')) {
        return Response.json({
          id: SHEET_ID,
          name: 'Translations',
          mimeType: 'application/vnd.google-apps.spreadsheet',
        });
      }
      if (url.includes('?fields=sheets.properties')) {
        return Response.json({
          sheets: TABS.map((tab) => ({
            properties: {sheetId: tab.gid, title: tab.title},
          })),
        });
      }
      if (url.includes('/values:batchGet?')) {
        return Response.json({valueRanges: [{values: [['Hello']]}]});
      }
      if (url.endsWith('/values:batchUpdate')) {
        expect(init.method).toBe('POST');
        return Response.json({
          totalUpdatedCells: 1,
          responses: [{updatedRange: 'Sheet1!B2'}],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const input = {
      url: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=0`,
      updates: [{range: 'B2', values: [['Hola']]}],
    };

    const preview = await previewGoogleWriteTool('gsheet_updateValues', input);
    expect(preview.error).toBeUndefined();
    expect(preview.before).toBe('Sheet1!B2: "Hello"');
    expect(preview.after).toBe('Sheet1!B2: "Hola"');

    const result: any = await executeGoogleWriteTool(
      'gsheet_updateValues',
      input
    );
    expect(result.success).toBe(true);
    const [, init] = fetchMock.mock.calls.at(-1)!;
    expect(JSON.parse(init.body)).toEqual({
      valueInputOption: 'RAW',
      data: [
        {range: "'Sheet1'!B2:B2", majorDimension: 'ROWS', values: [['Hola']]},
      ],
    });
  });
});

describe('doc text edits', () => {
  /** Builds a Docs API paragraph element. */
  const paragraph = (...runs: string[]) => ({
    paragraph: {elements: runs.map((content) => ({textRun: {content}}))},
  });

  it('extracts paragraphs from tab bodies, tables and headers', () => {
    const segments = extractDocParagraphs({
      tabs: [
        {
          documentTab: {
            body: {
              content: [
                paragraph('Hello ', 'world\n'),
                {
                  table: {
                    tableRows: [
                      {tableCells: [{content: [paragraph('Cell\n')]}]},
                    ],
                  },
                },
              ],
            },
            headers: {h1: {content: [paragraph('Header\n')]}},
          },
        },
      ],
    });
    expect(segments).toEqual([['Hello world\n', 'Cell\n'], ['Header\n']]);
  });

  it('applies replacements in order, per paragraph, and appends to the body', () => {
    const {segments, counts} = simulateTextEdits(
      [['Buy now.\n', 'buy later\n'], ['Footer: buy\n']],
      [
        {op: 'replace', find: 'buy', replace: 'Shop', matchCase: false},
        {op: 'replace', find: 'Shop now', replace: 'Shop today'},
        // Matches never span paragraphs.
        {op: 'replace', find: '.\nShop', replace: 'x'},
        {op: 'append', text: 'P.S.\nThanks'},
      ]
    );
    expect(counts).toEqual([3, 1, 0, 0]);
    expect(segments).toEqual([
      ['Shop today.\n', 'Shop later\n', 'P.S.\n', 'Thanks\n'],
      ['Footer: Shop\n'],
    ]);
  });
});

describe('previewGoogleWriteTool', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('https://www.googleapis.com/drive/v3/files/')) {
          return Response.json({
            id: SHEET_ID,
            name: 'Launch doc',
            mimeType: 'application/vnd.google-apps.document',
          });
        }
        return Response.json({
          body: {content: [paragraph('Launching soon\n')]},
        });
      })
    );
  });

  function paragraph(content: string) {
    return {paragraph: {elements: [{textRun: {content}}]}};
  }

  it('rejects a doc edit whose text is not in the doc', async () => {
    const preview = await previewGoogleWriteTool('gdoc_edit', {
      url: SHEET_ID,
      operations: [{op: 'replace', find: '**Launching**', replace: 'Live'}],
    });
    expect(preview.error).toBe('GOOGLE_NOT_FOUND');
    expect(preview.hint).toContain('gdoc_get');
  });

  it('shows a text diff for a doc edit', async () => {
    const preview = await previewGoogleWriteTool('gdoc_edit', {
      url: SHEET_ID,
      operations: [{op: 'replace', find: 'soon', replace: 'today'}],
    });
    expect(preview.error).toBeUndefined();
    expect(preview.before).toBe('Launching soon\n');
    expect(preview.after).toBe('Launching today\n');
    expect(preview.approveLabel).toBe('Approve doc edit');
  });
});
