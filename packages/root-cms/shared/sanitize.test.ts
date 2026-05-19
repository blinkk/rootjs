import {describe, expect, it} from 'vitest';

import {sanitizeBlockHtml, sanitizeInlineHtml} from './sanitize.js';

describe('sanitizeInlineHtml', () => {
  it('returns an empty string for falsy input', () => {
    expect(sanitizeInlineHtml('')).toBe('');
    expect(sanitizeInlineHtml(undefined as unknown as string)).toBe('');
  });

  it('preserves safe inline formatting', () => {
    const out = sanitizeInlineHtml(
      'Hello <b>bold</b> <i>italic</i> <code>code</code>'
    );
    expect(out).toBe('Hello <b>bold</b> <i>italic</i> <code>code</code>');
  });

  it('strips <script> tags', () => {
    const out = sanitizeInlineHtml('hi<script>alert(1)</script>');
    expect(out).toBe('hi');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert');
  });

  it('strips event handler attributes', () => {
    const out = sanitizeInlineHtml('<a href="/x" onclick="alert(1)">x</a>');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('alert');
  });

  it('strips javascript: hrefs', () => {
    const out = sanitizeInlineHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
  });

  it('strips data: hrefs on anchors', () => {
    const out = sanitizeInlineHtml('<a href="data:text/html,<b>">x</a>');
    expect(out).not.toContain('data:');
  });

  it('drops block-level tags in inline context', () => {
    const out = sanitizeInlineHtml('<p>hi</p><div>x</div>');
    expect(out).not.toContain('<p>');
    expect(out).not.toContain('<div>');
  });

  it('adds rel="noopener noreferrer" to target=_blank links', () => {
    const out = sanitizeInlineHtml(
      '<a href="https://x.test" target="_blank">x</a>'
    );
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('strips img tags in inline context', () => {
    const out = sanitizeInlineHtml('<img src=x onerror="alert(1)">');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('onerror');
  });
});

describe('sanitizeBlockHtml', () => {
  it('returns an empty string for falsy input', () => {
    expect(sanitizeBlockHtml('')).toBe('');
  });

  it('preserves block-level structure', () => {
    const out = sanitizeBlockHtml(
      '<h2>Title</h2><p>Para</p><ul><li>x</li></ul>'
    );
    expect(out).toBe('<h2>Title</h2><p>Para</p><ul><li>x</li></ul>');
  });

  it('strips <script> tags', () => {
    const out = sanitizeBlockHtml('<p>hi</p><script>steal()</script>');
    expect(out).toContain('<p>hi</p>');
    expect(out).not.toContain('<script');
  });

  it('strips inline event handlers on block tags', () => {
    const out = sanitizeBlockHtml('<div onmouseover="x()">hi</div>');
    expect(out).not.toContain('onmouseover');
  });

  it('strips javascript: image sources', () => {
    const out = sanitizeBlockHtml('<img src="javascript:alert(1)">');
    expect(out).not.toContain('javascript:');
  });

  it('allows data: image sources', () => {
    const out = sanitizeBlockHtml(
      '<img src="data:image/png;base64,iVBORw0K">'
    );
    expect(out).toContain('data:image/png');
  });

  it('blocks protocol-relative URLs', () => {
    const out = sanitizeBlockHtml('<a href="//evil.test">x</a>');
    expect(out).not.toContain('//evil.test');
  });
});
