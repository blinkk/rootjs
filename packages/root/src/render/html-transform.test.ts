import {expect, test} from 'vitest';
import {RootConfig} from '../core/config.js';
import {transformHtml} from './html-transform.js';

const HTML = '<!doctype html>\n<div>lorem ipsum <my-element>bar</my-element></div>\n';

function config(overrides: Partial<RootConfig>): RootConfig {
  return overrides as RootConfig;
}

test('no formatting by default (opt-in)', async () => {
  const output = await transformHtml(HTML, config({}));
  expect(output).toBe(HTML);
});

test('minifyHtml: true opts in to minification', async () => {
  const output = await transformHtml(HTML, config({minifyHtml: true}));
  expect(output).toBe(
    '<!doctype html>\n<div>lorem ipsum<my-element>bar</my-element></div>\n'
  );
});

test('prettyHtml: true opts in to pretty printing', async () => {
  const output = await transformHtml(HTML, config({prettyHtml: true}));
  expect(output).toContain('<my-element>bar</my-element>');
  // js-beautify reformats but preserves content.
  expect(output).toContain('lorem ipsum');
});

test('prettyHtml takes precedence over minifyHtml', async () => {
  const output = await transformHtml(
    HTML,
    config({prettyHtml: true, minifyHtml: true})
  );
  // If minify had run, the space before <my-element> would be collapsed.
  expect(output).not.toContain('lorem ipsum<my-element>');
  expect(output).toContain('lorem ipsum <my-element>');
});

test('jsxRenderer mode ignores minifyHtml', async () => {
  const output = await transformHtml(
    HTML,
    config({jsxRenderer: {mode: 'pretty'}, minifyHtml: true})
  );
  // The built-in JSX renderer controls its own formatting, so minifyHtml is
  // ignored and the html is returned untouched (whitespace preserved).
  expect(output).toBe(HTML);
});

test('jsxRenderer mode ignores prettyHtml', async () => {
  const output = await transformHtml(
    HTML,
    config({jsxRenderer: {mode: 'minimal'}, prettyHtml: true})
  );
  expect(output).toBe(HTML);
});
