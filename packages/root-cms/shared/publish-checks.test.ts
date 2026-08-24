import {describe, expect, it} from 'vitest';
import {
  normalizePublishChecks,
  summarizePublishChecks,
  type PublishCheckResult,
} from './publish-checks.js';

describe('normalizePublishChecks', () => {
  it('returns an empty list when nothing is configured', () => {
    expect(normalizePublishChecks()).toEqual([]);
    expect(normalizePublishChecks([])).toEqual([]);
  });

  it('defaults string shorthand to the required level', () => {
    expect(normalizePublishChecks(['seo-meta'])).toEqual([
      {id: 'seo-meta', level: 'required'},
    ]);
  });

  it('defaults config objects without a level to required', () => {
    expect(normalizePublishChecks([{id: 'seo-meta'}])).toEqual([
      {id: 'seo-meta', level: 'required'},
    ]);
  });

  it('preserves the warning level', () => {
    expect(
      normalizePublishChecks([{id: 'seo-meta', level: 'warning'}])
    ).toEqual([{id: 'seo-meta', level: 'warning'}]);
  });

  it('coerces unknown levels to required', () => {
    expect(
      normalizePublishChecks([{id: 'seo-meta', level: 'bogus' as any}])
    ).toEqual([{id: 'seo-meta', level: 'required'}]);
  });

  it('drops entries without an id', () => {
    expect(
      normalizePublishChecks(['', '  ', {id: ''}, null as any, {id: 'ok'}])
    ).toEqual([{id: 'ok', level: 'required'}]);
  });

  it('trims ids', () => {
    expect(normalizePublishChecks(['  seo-meta  '])).toEqual([
      {id: 'seo-meta', level: 'required'},
    ]);
  });

  it('keeps the first entry when an id is duplicated', () => {
    expect(
      normalizePublishChecks([
        {id: 'seo-meta', level: 'warning'},
        {id: 'seo-meta', level: 'required'},
      ])
    ).toEqual([{id: 'seo-meta', level: 'warning'}]);
  });
});

function result(
  overrides: Partial<PublishCheckResult> & Pick<PublishCheckResult, 'status'>
): PublishCheckResult {
  return {
    docId: 'Pages/index',
    checkId: 'seo-meta',
    label: 'SEO Meta',
    level: 'required',
    message: 'message',
    ...overrides,
  };
}

describe('summarizePublishChecks', () => {
  it('buckets a passing result as passed', () => {
    const summary = summarizePublishChecks([result({status: 'success'})]);
    expect(summary.passed).toHaveLength(1);
    expect(summary.blocking).toHaveLength(0);
    expect(summary.warnings).toHaveLength(0);
  });

  it('blocks on an error from a required check', () => {
    const summary = summarizePublishChecks([
      result({status: 'error', level: 'required'}),
    ]);
    expect(summary.blocking).toHaveLength(1);
    expect(summary.warnings).toHaveLength(0);
  });

  it('downgrades an error from a warning-level check to a warning', () => {
    const summary = summarizePublishChecks([
      result({status: 'error', level: 'warning'}),
    ]);
    expect(summary.blocking).toHaveLength(0);
    expect(summary.warnings).toHaveLength(1);
  });

  it('never blocks on a warning status, even for a required check', () => {
    const summary = summarizePublishChecks([
      result({status: 'warning', level: 'required'}),
    ]);
    expect(summary.blocking).toHaveLength(0);
    expect(summary.warnings).toHaveLength(1);
  });

  it('buckets a mixed set of results across docs', () => {
    const summary = summarizePublishChecks([
      result({docId: 'Pages/a', status: 'success'}),
      result({docId: 'Pages/b', status: 'error', level: 'required'}),
      result({docId: 'Pages/c', status: 'warning', level: 'warning'}),
      result({docId: 'Pages/d', status: 'error', level: 'warning'}),
    ]);
    expect(summary.passed.map((r) => r.docId)).toEqual(['Pages/a']);
    expect(summary.blocking.map((r) => r.docId)).toEqual(['Pages/b']);
    expect(summary.warnings.map((r) => r.docId)).toEqual([
      'Pages/c',
      'Pages/d',
    ]);
  });

  it('handles an empty result set', () => {
    expect(summarizePublishChecks([])).toEqual({
      blocking: [],
      warnings: [],
      passed: [],
    });
  });
});
