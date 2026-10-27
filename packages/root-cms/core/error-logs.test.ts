// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {build} from 'esbuild';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {normalizeErrorReport, resolveStack} from './error-logs.js';

describe('resolveStack', () => {
  let tmpDir: string;
  let staticDir: string;
  let throwColumn: number;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-logs-test-'));
    staticDir = path.join(tmpDir, 'dist', 'ui');
    const srcDir = path.join(tmpDir, 'ui');
    fs.mkdirSync(srcDir, {recursive: true});
    fs.writeFileSync(
      path.join(srcDir, 'app.ts'),
      [
        'export function render(value: string) {',
        '  if (!value) {',
        "    throw new Error('boom');",
        '  }',
        '  return value;',
        '}',
        '',
      ].join('\n')
    );
    // Mirrors the `build:ui:bundle` flags in package.json.
    await build({
      entryPoints: [path.join(srcDir, 'app.ts')],
      bundle: true,
      minify: true,
      format: 'esm',
      outdir: staticDir,
      sourcemap: 'external',
      sourcesContent: false,
      logLevel: 'silent',
    });
    const code = fs.readFileSync(path.join(staticDir, 'app.js'), 'utf8');
    throwColumn = code.indexOf('throw') + 1;
  });

  afterAll(() => {
    fs.rmSync(tmpDir, {recursive: true, force: true});
  });

  it('resolves frames in the cms ui bundle to the original source', () => {
    const stack = [
      'Error: boom',
      `    at a (https://example.com/cms/static/app.js?c=123:1:${throwColumn})`,
      `    at https://example.com/cms/static/app.js:1:${throwColumn}`,
      `a@https://example.com/cms/static/app.js:1:${throwColumn}`,
    ].join('\n');
    expect(resolveStack(stack, staticDir)).toBe(
      [
        'Error: boom',
        '    at a (ui/app.ts:3:5)',
        '    at ui/app.ts:3:5',
        'a@ui/app.ts:3:5',
      ].join('\n')
    );
  });

  it('leaves frames it cannot resolve as-is', () => {
    const stack = [
      'Error: boom',
      '    at a (https://example.com/static/site.js:1:10)',
      '    at b (https://example.com/cms/static/missing.js:1:10)',
    ].join('\n');
    expect(resolveStack(stack, staticDir)).toBe(stack);
  });
});

describe('normalizeErrorReport', () => {
  it('rejects reports without a valid id or message', () => {
    expect(normalizeErrorReport({id: 'abc', message: ''})).toBeNull();
    expect(normalizeErrorReport({id: '../abc', message: 'boom'})).toBeNull();
    expect(normalizeErrorReport(null)).toBeNull();
  });

  it('keeps only known fields and trims long values', () => {
    const report = normalizeErrorReport({
      id: 'abc123',
      source: 'not-a-source',
      message: 'x'.repeat(10000),
      url: 'https://example.com/cms',
      timestamp: 1000,
      by: 'spoofed@example.com',
      extra: 'ignored',
    });
    expect(report).toEqual({
      id: 'abc123',
      source: 'uncaught',
      message: 'x'.repeat(4000),
      url: 'https://example.com/cms',
      timestamp: 1000,
    });
  });
});
