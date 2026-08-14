import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  buildPublishChecksAudit,
  getCollectionPublishChecks,
  runPublishChecks,
  testHasPublishChecks,
} from './publish-checks.js';

/** Sets up `window.__ROOT_CTX` with the given collections and check registry. */
function setCtx(options: {collections?: any; checks?: any[]}) {
  window.__ROOT_CTX = {
    rootConfig: {projectId: 'test-project'},
    collections: options.collections || {},
    checks: options.checks || [],
  } as any;
}

const SEO_CHECK = {id: 'seo-meta', label: 'SEO Meta', description: 'Checks.'};
const A11Y_CHECK = {id: 'a11y', label: 'Accessibility'};

describe('getCollectionPublishChecks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an empty list when the collection has no checks configured', () => {
    setCtx({collections: {Pages: {id: 'Pages'}}, checks: [SEO_CHECK]});
    expect(getCollectionPublishChecks('Pages')).toEqual([]);
  });

  it('returns an empty list for an unknown collection', () => {
    setCtx({collections: {}, checks: [SEO_CHECK]});
    expect(getCollectionPublishChecks('Nope')).toEqual([]);
  });

  it('resolves configured checks against the registry', () => {
    setCtx({
      collections: {
        Pages: {publishing: {checks: [{id: 'seo-meta', level: 'warning'}]}},
      },
      checks: [SEO_CHECK],
    });
    expect(getCollectionPublishChecks('Pages')).toEqual([
      {
        id: 'seo-meta',
        level: 'warning',
        label: 'SEO Meta',
        description: 'Checks.',
      },
    ]);
  });

  it('omits checks that are not registered', () => {
    setCtx({
      collections: {Pages: {publishing: {checks: ['seo-meta', 'ghost']}}},
      checks: [SEO_CHECK],
    });
    expect(getCollectionPublishChecks('Pages').map((c) => c.id)).toEqual([
      'seo-meta',
    ]);
  });

  it("omits checks restricted to another collection by the check's allowlist", () => {
    setCtx({
      collections: {Pages: {publishing: {checks: ['a11y']}}},
      checks: [{...A11Y_CHECK, collections: ['Posts']}],
    });
    expect(getCollectionPublishChecks('Pages')).toEqual([]);
  });

  it('keeps checks whose allowlist includes the collection', () => {
    setCtx({
      collections: {Pages: {publishing: {checks: ['a11y']}}},
      checks: [{...A11Y_CHECK, collections: ['Pages']}],
    });
    expect(getCollectionPublishChecks('Pages').map((c) => c.id)).toEqual([
      'a11y',
    ]);
  });
});

describe('testHasPublishChecks', () => {
  it('returns false when no doc belongs to a collection with checks', () => {
    setCtx({
      collections: {Pages: {}, Posts: {}},
      checks: [SEO_CHECK],
    });
    expect(testHasPublishChecks(['Pages/index', 'Posts/hello'])).toBe(false);
  });

  it('returns true when at least one doc has checks configured', () => {
    setCtx({
      collections: {
        Pages: {},
        Posts: {publishing: {checks: ['seo-meta']}},
      },
      checks: [SEO_CHECK],
    });
    expect(testHasPublishChecks(['Pages/index', 'Posts/hello'])).toBe(true);
  });

  it('returns false for an empty doc list', () => {
    setCtx({collections: {}, checks: []});
    expect(testHasPublishChecks([])).toBe(false);
  });
});

describe('runPublishChecks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('skips the request entirely when no docs have checks', async () => {
    setCtx({collections: {Pages: {}}, checks: [SEO_CHECK]});
    const fetchSpy = vi.fn();
    window.fetch = fetchSpy as any;
    await expect(runPublishChecks(['Pages/index'])).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts the doc ids and returns the results', async () => {
    setCtx({
      collections: {Pages: {publishing: {checks: ['seo-meta']}}},
      checks: [SEO_CHECK],
    });
    const results = [
      {
        docId: 'Pages/index',
        checkId: 'seo-meta',
        label: 'SEO Meta',
        level: 'required',
        status: 'error',
        message: 'Missing title.',
      },
    ];
    const fetchSpy = vi.fn().mockResolvedValue({
      json: async () => ({success: true, data: {results}}),
    });
    window.fetch = fetchSpy as any;

    await expect(runPublishChecks(['Pages/index'])).resolves.toEqual(results);
    expect(fetchSpy).toHaveBeenCalledWith('/cms/api/checks.run', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({docIds: ['Pages/index']}),
    });
  });

  it('throws a helpful error when too many docs are requested', async () => {
    setCtx({
      collections: {Pages: {publishing: {checks: ['seo-meta']}}},
      checks: [SEO_CHECK],
    });
    window.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        success: false,
        error: 'TOO_MANY_DOCS',
        maxDocs: 500,
      }),
    }) as any;
    await expect(runPublishChecks(['Pages/index'])).rejects.toThrow(
      /500 docs at a time/
    );
  });

  it('throws when the request fails', async () => {
    setCtx({
      collections: {Pages: {publishing: {checks: ['seo-meta']}}},
      checks: [SEO_CHECK],
    });
    window.fetch = vi.fn().mockResolvedValue({
      json: async () => ({success: false, error: 'UNAUTHORIZED'}),
    }) as any;
    await expect(runPublishChecks(['Pages/index'])).rejects.toThrow(
      'UNAUTHORIZED'
    );
  });
});

describe('buildPublishChecksAudit', () => {
  it('records only the skip when checks were skipped', () => {
    expect(buildPublishChecksAudit([], {skipped: true})).toEqual({
      skipped: true,
    });
  });

  it('returns null when no checks ran', () => {
    expect(buildPublishChecksAudit([])).toBeNull();
  });

  it('counts passes and warnings', () => {
    const audit = buildPublishChecksAudit([
      {
        docId: 'Pages/a',
        checkId: 'seo-meta',
        label: 'SEO Meta',
        level: 'required',
        status: 'success',
        message: '',
      },
      {
        docId: 'Pages/b',
        checkId: 'seo-meta',
        label: 'SEO Meta',
        level: 'warning',
        status: 'warning',
        message: '',
      },
    ]);
    expect(audit).toEqual({passed: 1, warnings: 1});
  });

  it('records the failed checks and the bypass', () => {
    const audit = buildPublishChecksAudit(
      [
        {
          docId: 'Pages/a',
          checkId: 'seo-meta',
          label: 'SEO Meta',
          level: 'required',
          status: 'error',
          message: '',
        },
      ],
      {bypassed: true}
    );
    expect(audit).toEqual({
      passed: 0,
      warnings: 0,
      failed: ['Pages/a::seo-meta'],
      bypassed: true,
    });
  });
});
