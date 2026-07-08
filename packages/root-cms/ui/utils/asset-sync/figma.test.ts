import {afterEach, describe, expect, it, vi} from 'vitest';
import {FIGMA_PROVIDER, buildExportFilename, parseFigmaUrl} from './figma.js';
import {SyncAuthContext, SyncRateLimitError} from './types.js';

describe('parseFigmaUrl', () => {
  it('parses design URLs', () => {
    expect(
      parseFigmaUrl('https://www.figma.com/design/AbC123xyz/My-File')
    ).toEqual({fileKey: 'AbC123xyz'});
  });

  it('parses node ids, converting - to :', () => {
    expect(
      parseFigmaUrl(
        'https://www.figma.com/design/AbC123xyz/My-File?node-id=12-345&t=xyz'
      )
    ).toEqual({fileKey: 'AbC123xyz', nodeId: '12:345'});
  });

  it('parses legacy file URLs', () => {
    expect(
      parseFigmaUrl('https://www.figma.com/file/AbC123xyz/My-File?node-id=1-2')
    ).toEqual({fileKey: 'AbC123xyz', nodeId: '1:2'});
  });

  it('parses proto URLs', () => {
    expect(parseFigmaUrl('https://www.figma.com/proto/AbC123xyz/Demo')).toEqual(
      {fileKey: 'AbC123xyz'}
    );
  });

  it('uses the branch key for branch URLs', () => {
    expect(
      parseFigmaUrl(
        'https://www.figma.com/design/AbC123xyz/branch/DeF456uvw/My-File'
      )
    ).toEqual({fileKey: 'DeF456uvw'});
  });

  it('accepts figma.com without www', () => {
    expect(parseFigmaUrl('https://figma.com/design/AbC123xyz/File')).toEqual({
      fileKey: 'AbC123xyz',
    });
  });

  it('rejects non-figma URLs', () => {
    expect(parseFigmaUrl('https://example.com/design/AbC123xyz/x')).toBeNull();
    expect(parseFigmaUrl('https://notfigma.com/file/AbC123xyz/x')).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(parseFigmaUrl('')).toBeNull();
    expect(parseFigmaUrl('not a url')).toBeNull();
    expect(parseFigmaUrl('https://www.figma.com/')).toBeNull();
    expect(parseFigmaUrl('https://www.figma.com/design/')).toBeNull();
    // File keys are alphanumeric.
    expect(
      parseFigmaUrl('https://www.figma.com/design/../etc/passwd')
    ).toBeNull();
  });
});

describe('buildExportFilename', () => {
  it('builds a filename from the node name, suffix and format', () => {
    expect(buildExportFilename('hero', {suffix: '@2x', format: 'PNG'})).toEqual(
      'hero@2x.png'
    );
  });

  it('sanitizes slashes in node names', () => {
    expect(buildExportFilename('icon/24/arrow', {format: 'SVG'})).toEqual(
      'icon-24-arrow.svg'
    );
  });

  it('defaults to png and normalizes jpeg', () => {
    expect(buildExportFilename('hero', {})).toEqual('hero.png');
    expect(buildExportFilename('hero', {format: 'JPEG'})).toEqual('hero.jpg');
  });
});

describe('FIGMA_PROVIDER.validateToken', () => {
  /** Stubs global fetch, routing by URL substring. */
  function stubFetch(routes: Record<string, {status: number; body: any}>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const match = Object.entries(routes).find(([key]) =>
          String(url).includes(key)
        );
        const {status, body} = match ? match[1] : {status: 404, body: {}};
        return {
          ok: status >= 200 && status < 300,
          status,
          json: async () => body,
        } as any;
      })
    );
  }

  const SOURCE = {
    provider: 'figma',
    url: 'https://www.figma.com/design/AbC123/File',
    figma: {fileKey: 'AbC123'},
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts tokens that can call /v1/me', async () => {
    stubFetch({'/v1/me': {status: 200, body: {email: 'a@example.com'}}});
    expect(await FIGMA_PROVIDER.validateToken!('tok', SOURCE)).toEqual({
      valid: true,
      account: 'a@example.com',
    });
  });

  it('accepts scoped file-content tokens that cannot call /v1/me', async () => {
    // Scoped PATs with only "File content" access get 403 "Invalid scope"
    // from /v1/me; validation must fall back to the target file.
    stubFetch({
      '/v1/me': {status: 403, body: {status: 403, err: 'Invalid scope'}},
      '/v1/files/AbC123': {status: 200, body: {name: 'File'}},
    });
    expect(await FIGMA_PROVIDER.validateToken!('tok', SOURCE)).toEqual({
      valid: true,
    });
  });

  it('accepts scope-limited tokens when no source is available', async () => {
    stubFetch({
      '/v1/me': {status: 403, body: {status: 403, err: 'Invalid scope'}},
    });
    expect((await FIGMA_PROVIDER.validateToken!('tok')).valid).toBe(true);
  });

  it('rejects invalid tokens', async () => {
    stubFetch({
      '/v1/me': {status: 403, body: {status: 403, err: 'Invalid token'}},
    });
    expect((await FIGMA_PROVIDER.validateToken!('bad', SOURCE)).valid).toBe(
      false
    );
  });

  it('reports missing file access with a specific error', async () => {
    stubFetch({
      '/v1/me': {status: 403, body: {status: 403, err: 'Invalid scope'}},
      '/v1/files/AbC123': {
        status: 403,
        body: {status: 403, err: 'Not authorized'},
      },
    });
    const check = await FIGMA_PROVIDER.validateToken!('tok', SOURCE);
    expect(check.valid).toBe(false);
    expect(check.error).toContain("can't read this Figma file");
  });
});

describe('FIGMA_PROVIDER rate limiting', () => {
  const SOURCE = {
    provider: 'figma',
    url: 'https://www.figma.com/design/AbC123/File',
    figma: {fileKey: 'AbC123'},
  };
  const AUTH: SyncAuthContext = {
    getToken: async () => 'tok',
    invalidateToken: () => {},
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('retries a rate-limited request and reports a countdown', async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) {
          return {
            ok: false,
            status: 429,
            headers: {get: () => '1'},
            json: async () => ({}),
          } as any;
        }
        return {
          ok: true,
          status: 200,
          headers: {get: () => null},
          json: async () => ({
            version: '9',
            document: {id: '0:0', name: 'root', children: []},
          }),
        } as any;
      })
    );
    const notes: string[] = [];
    const promise = FIGMA_PROVIDER.listRemoteAssets(SOURCE, AUTH, {
      onStatus: (message) => notes.push(message),
    });
    await vi.advanceTimersByTimeAsync(11_000);
    const result = await promise;
    expect(result.version).toEqual('9');
    expect(calls).toEqual(2);
    expect(notes.some((n) => n.includes('rate limit'))).toBe(true);
  });

  it('throws SyncRateLimitError after exhausting retries', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 429,
            headers: {get: () => null},
            json: async () => ({}),
          }) as any
      )
    );
    const promise = FIGMA_PROVIDER.listRemoteAssets(SOURCE, AUTH).catch(
      (err) => err
    );
    // Backoff floors are 10s + 20s + 30s before the final attempt.
    await vi.advanceTimersByTimeAsync(61_000);
    const err = await promise;
    expect(err).toBeInstanceOf(SyncRateLimitError);
    expect(String(err.message)).toContain('rate-limiting');
  });
});

describe('FIGMA_PROVIDER.parseSourceUrl', () => {
  it('returns a source ref for figma URLs', () => {
    const url = 'https://www.figma.com/design/AbC123xyz/File?node-id=1-2';
    expect(FIGMA_PROVIDER.parseSourceUrl(url)).toEqual({
      provider: 'figma',
      url: url,
      figma: {fileKey: 'AbC123xyz', nodeId: '1:2'},
    });
  });

  it('returns null for unrecognized URLs', () => {
    expect(FIGMA_PROVIDER.parseSourceUrl('https://example.com/x')).toBeNull();
  });
});
