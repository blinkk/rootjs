import {Timestamp} from 'firebase-admin/firestore';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  DataSource,
  GCLOUD_GSHEET_LOGIN_COMMAND,
  RootCMSClient,
  formatGsheetApiError,
  parseSpreadsheetUrl,
} from './client.js';

/** Encodes a minimal JWT with the given payload for testing `id_token` decoding. */
function makeTestIdToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({alg: 'RS256'})).toString(
    'base64url'
  );
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

describe('parseSpreadsheetUrl', () => {
  it('parses standard Google Sheets URLs with #gid', () => {
    expect(
      parseSpreadsheetUrl(
        'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit#gid=42'
      )
    ).toEqual({
      spreadsheetId: '1AbCdEfGhIjKlMnOp',
      gid: 42,
    });
  });

  it('parses Google Sheets URLs with ?gid query parameter', () => {
    expect(
      parseSpreadsheetUrl(
        'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit?gid=99#gid=99'
      )
    ).toEqual({
      spreadsheetId: '1AbCdEfGhIjKlMnOp',
      gid: 99,
    });
    expect(
      parseSpreadsheetUrl(
        'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp?gid=77'
      )
    ).toEqual({
      spreadsheetId: '1AbCdEfGhIjKlMnOp',
      gid: 77,
    });
  });

  it('defaults gid to 0 when omitted', () => {
    expect(
      parseSpreadsheetUrl(
        'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit'
      )
    ).toEqual({
      spreadsheetId: '1AbCdEfGhIjKlMnOp',
      gid: 0,
    });
  });

  it('returns null for non-Google Sheets URLs', () => {
    expect(parseSpreadsheetUrl('https://example.com/sheet')).toBeNull();
    expect(
      parseSpreadsheetUrl('https://docs.google.com/spreadsheets/d/')
    ).toBeNull();
  });
});

describe('formatGsheetApiError', () => {
  const sampleDataSource: DataSource = {
    id: 'translations-sheet',
    type: 'gsheet',
    url: 'https://docs.google.com/spreadsheets/d/sheet123/edit#gid=0',
    createdAt: Timestamp.now(),
    createdBy: 'dev@example.com',
  };

  it('formats 403 ACCESS_TOKEN_SCOPE_INSUFFICIENT with gcloud login command', () => {
    const msg = formatGsheetApiError({
      status: 403,
      errJson: {
        error: {
          code: 403,
          message: 'Request had insufficient authentication scopes.',
          status: 'PERMISSION_DENIED',
          details: [{reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT'}],
        },
      },
      errText: '',
      dataSource: sampleDataSource,
      spreadsheetId: 'sheet123',
      auth: {
        accessToken: 'tok',
        accountEmail: 'dev@example.com',
        quotaProjectId: 'my-cms-proj',
        isUserCredential: true,
        source: 'adc',
      },
    });

    expect(msg).toContain('missing the Google Sheets scope');
    expect(msg).toContain(GCLOUD_GSHEET_LOGIN_COMMAND);
  });

  it('formats 403 SERVICE_DISABLED with enable API and quota project commands', () => {
    const msg = formatGsheetApiError({
      status: 403,
      errJson: {
        error: {
          code: 403,
          message:
            'Google Sheets API has not been used in project my-cms-proj before or it is disabled.',
          status: 'PERMISSION_DENIED',
          details: [{reason: 'SERVICE_DISABLED'}],
        },
      },
      errText: '',
      dataSource: sampleDataSource,
      spreadsheetId: 'sheet123',
      auth: {
        accessToken: 'tok',
        accountEmail: 'dev@example.com',
        quotaProjectId: 'my-cms-proj',
        isUserCredential: true,
        source: 'adc',
      },
    });

    expect(msg).toContain(
      'gcloud services enable sheets.googleapis.com --project=my-cms-proj'
    );
    expect(msg).toContain(
      'gcloud auth application-default set-quota-project my-cms-proj'
    );
  });

  it('formats 403 PERMISSION_DENIED on spreadsheet with the logged-in user email', () => {
    const msg = formatGsheetApiError({
      status: 403,
      errJson: {
        error: {
          code: 403,
          message: 'The caller does not have permission',
          status: 'PERMISSION_DENIED',
        },
      },
      errText: '',
      dataSource: sampleDataSource,
      spreadsheetId: 'sheet123',
      auth: {
        accessToken: 'tok',
        accountEmail: 'alice@example.com',
        quotaProjectId: 'my-cms-proj',
        isUserCredential: true,
        source: 'adc',
      },
    });

    expect(msg).toContain('permission denied accessing spreadsheet "sheet123"');
    expect(msg).toContain('alice@example.com');
  });

  it('formats 401 and 404 errors clearly', () => {
    const msg401 = formatGsheetApiError({
      status: 401,
      errJson: {error: {message: 'Invalid Credentials'}},
      errText: '',
      dataSource: sampleDataSource,
      spreadsheetId: 'sheet123',
      auth: {
        accessToken: 'tok',
        isUserCredential: true,
        source: 'adc',
      },
    });
    expect(msg401).toContain('invalid or expired');
    expect(msg401).toContain(GCLOUD_GSHEET_LOGIN_COMMAND);

    const msg404 = formatGsheetApiError({
      status: 404,
      errJson: {error: {message: 'Requested entity was not found.'}},
      errText: '',
      dataSource: sampleDataSource,
      spreadsheetId: 'sheet123',
      auth: {
        accessToken: 'tok',
        isUserCredential: true,
        source: 'adc',
      },
    });
    expect(msg404).toContain('spreadsheet "sheet123" was not found');
  });
});

describe('RootCMSClient data source sync with gcloud user', () => {
  const projectId = 'test-project';
  let storedDocs: Map<string, any>;
  let mockDb: any;
  let client: RootCMSClient;

  beforeEach(() => {
    storedDocs = new Map<string, any>();
    mockDb = {
      doc: (path: string) => ({
        path,
        get: async () => ({
          exists: storedDocs.has(path),
          data: () => storedDocs.get(path),
        }),
        set: async (data: any) => {
          storedDocs.set(path, data);
        },
        update: async (data: any) => {
          storedDocs.set(path, {...(storedDocs.get(path) || {}), ...data});
        },
      }),
      collection: (colPath: string) => ({
        get: async () => {
          const docs: Array<{data: () => any}> = [];
          for (const [k, v] of storedDocs.entries()) {
            if (
              k.startsWith(`${colPath}/`) &&
              !k.slice(colPath.length + 1).includes('/')
            ) {
              docs.push({data: () => v});
            }
          }
          return {
            docs,
            forEach: (cb: (d: {data: () => any}) => void) => docs.forEach(cb),
          };
        },
      }),
      batch: () => {
        const ops: Array<() => void> = [];
        return {
          set: (ref: {path: string}, data: any) => {
            ops.push(() => storedDocs.set(ref.path, data));
          },
          update: (ref: {path: string}, data: any) => {
            ops.push(() =>
              storedDocs.set(ref.path, {
                ...(storedDocs.get(ref.path) || {}),
                ...data,
              })
            );
          },
          delete: (ref: {path: string}) => {
            ops.push(() => storedDocs.delete(ref.path));
          },
          commit: async () => {
            ops.forEach((op) => op());
          },
        };
      },
    };

    client = Object.create(RootCMSClient.prototype);
    Object.assign(client, {
      projectId,
      db: mockDb,
      cmsPlugin: {
        getConfig: () => ({
          firebaseConfig: {projectId: 'cms-gcp-project'},
        }),
      },
      app: {options: {projectId: 'cms-gcp-project'}},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists configured data sources via listDataSources()', async () => {
    storedDocs.set(`Projects/${projectId}/DataSources/sheet-a`, {
      id: 'sheet-a',
      type: 'gsheet',
      url: 'https://docs.google.com/spreadsheets/d/abc/edit#gid=0',
    });
    storedDocs.set(`Projects/${projectId}/DataSources/http-b`, {
      id: 'http-b',
      type: 'http',
      url: 'https://example.com/data.json',
    });

    const list = await client.listDataSources();
    expect(list.map((d) => d.id)).toEqual(['sheet-a', 'http-b']);
  });

  it('fetches Google Sheet data using gcloud user credentials and quota project header, attributing syncedBy to the user', async () => {
    const id = 'menu-sheet';
    storedDocs.set(`Projects/${projectId}/DataSources/${id}`, {
      id,
      type: 'gsheet',
      url: 'https://docs.google.com/spreadsheets/d/sheetAbc/edit?gid=10#gid=10',
      dataFormat: 'map',
      createdAt: Timestamp.now(),
      createdBy: 'creator@example.com',
    });

    vi.spyOn(client as any, 'resolveGsheetAuth').mockResolvedValue({
      accessToken: 'gcloud-user-token',
      accountEmail: decodeEmailFromIdToken(
        makeTestIdToken({email: 'gcloud-user@example.com'})
      ),
      quotaProjectId: 'cms-gcp-project',
      fallbackQuotaProjectId: 'adc-fallback-project',
      isUserCredential: true,
      source: 'adc',
    });

    const fetchCalls: Array<{url: string; headers: any}> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: any, init?: any) => {
        const url = String(input);
        fetchCalls.push({url, headers: init?.headers});
        if (url.includes('?fields=sheets.properties')) {
          return new Response(
            JSON.stringify({
              sheets: [
                {properties: {sheetId: 0, title: 'Overview'}},
                {properties: {sheetId: 10, title: 'Items'}},
              ],
            }),
            {status: 200, headers: {'content-type': 'application/json'}}
          );
        }
        if (url.includes('/values/Items')) {
          return new Response(
            JSON.stringify({
              values: [
                ['item', 'price'],
                ['Espresso', '4.00'],
                ['Latte', '5.50'],
              ],
            }),
            {status: 200, headers: {'content-type': 'application/json'}}
          );
        }
        return new Response('not found', {status: 404});
      }
    );

    await client.syncDataSource(id);

    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0].headers).toEqual({
      Authorization: 'Bearer gcloud-user-token',
      'x-goog-user-project': 'cms-gcp-project',
    });
    expect(fetchCalls[1].headers).toEqual({
      Authorization: 'Bearer gcloud-user-token',
      'x-goog-user-project': 'cms-gcp-project',
    });

    const draftData = storedDocs.get(
      `Projects/${projectId}/DataSources/${id}/Data/draft`
    );
    expect(draftData.data).toEqual([
      {item: 'Espresso', price: '4.00'},
      {item: 'Latte', price: '5.50'},
    ]);
    expect(draftData.headers).toEqual(['item', 'price']);
    expect(draftData.dataSource.syncedBy).toBe('gcloud-user@example.com');
  });

  it('retries with fallbackQuotaProjectId when primary quota project has Sheets API disabled', async () => {
    const id = 'fallback-quota-sheet';
    storedDocs.set(`Projects/${projectId}/DataSources/${id}`, {
      id,
      type: 'gsheet',
      url: 'https://docs.google.com/spreadsheets/d/sheetAbc/edit#gid=0',
      dataFormat: 'map',
      createdAt: Timestamp.now(),
      createdBy: 'creator@example.com',
    });

    vi.spyOn(client as any, 'resolveGsheetAuth').mockResolvedValue({
      accessToken: 'gcloud-user-token',
      accountEmail: 'gcloud-user@example.com',
      quotaProjectId: 'disabled-project',
      fallbackQuotaProjectId: 'enabled-adc-project',
      isUserCredential: true,
      source: 'adc',
    });

    const seenQuotaHeaders: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: any, init?: any) => {
        const url = String(input);
        const quotaHeader = init?.headers?.['x-goog-user-project'];
        seenQuotaHeaders.push(quotaHeader);
        if (quotaHeader === 'disabled-project') {
          return new Response(
            JSON.stringify({
              error: {
                code: 403,
                message:
                  'Google Sheets API has not been used in project disabled-project before or it is disabled.',
                details: [{reason: 'SERVICE_DISABLED'}],
              },
            }),
            {status: 403, headers: {'content-type': 'application/json'}}
          );
        }
        if (url.includes('?fields=sheets.properties')) {
          return new Response(
            JSON.stringify({
              sheets: [{properties: {sheetId: 0, title: 'Sheet1'}}],
            }),
            {status: 200, headers: {'content-type': 'application/json'}}
          );
        }
        return new Response(
          JSON.stringify({
            values: [
              ['key', 'val'],
              ['hello', 'world'],
            ],
          }),
          {status: 200, headers: {'content-type': 'application/json'}}
        );
      }
    );

    await client.syncDataSource(id);

    expect(seenQuotaHeaders).toEqual([
      'disabled-project',
      'enabled-adc-project',
      'enabled-adc-project',
    ]);
  });

  it('logs and throws a user-friendly error when a requested sheet tab gid does not exist', async () => {
    const id = 'missing-tab-sheet';
    storedDocs.set(`Projects/${projectId}/DataSources/${id}`, {
      id,
      type: 'gsheet',
      url: 'https://docs.google.com/spreadsheets/d/sheetAbc/edit#gid=999',
      createdAt: Timestamp.now(),
      createdBy: 'creator@example.com',
    });

    vi.spyOn(client as any, 'resolveGsheetAuth').mockResolvedValue({
      accessToken: 'gcloud-user-token',
      accountEmail: 'gcloud-user@example.com',
      quotaProjectId: 'cms-gcp-project',
      isUserCredential: true,
      source: 'adc',
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          sheets: [
            {properties: {sheetId: 0, title: 'Main'}},
            {properties: {sheetId: 12, title: 'Archive'}},
          ],
        }),
        {status: 200, headers: {'content-type': 'application/json'}}
      )
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(client.syncDataSource(id)).rejects.toThrow(
      /sheet with gid 999 not found in spreadsheet "sheetAbc"\. Available tabs: "Main" \(gid=0\), "Archive" \(gid=12\)\./
    );
    expect(errorSpy).toHaveBeenCalled();
  });
});

function decodeEmailFromIdToken(token: string): string | undefined {
  const payload = JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString('utf8')
  );
  return payload.email;
}
