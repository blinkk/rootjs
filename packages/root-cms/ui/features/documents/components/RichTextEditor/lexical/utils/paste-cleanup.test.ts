import {describe, expect, it} from 'vitest';
import {cleanPastedHtml} from './paste-cleanup.js';

function clean(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const modified = cleanPastedHtml(doc);
  return {modified, html: doc.body.innerHTML};
}

describe('cleanPastedHtml', () => {
  it('removes blank paragraphs between paragraphs', () => {
    const res = clean(
      '<p>one</p><p></p><p>two</p><p><span></span></p><p><span>&nbsp;</span></p><p>three</p>'
    );
    expect(res.modified).toBe(true);
    expect(res.html).toBe('<p>one</p><p>two</p><p>three</p>');
  });

  it('removes paragraphs containing only line breaks', () => {
    const res = clean('<p>one</p><p><br></p><p>two</p>');
    expect(res.modified).toBe(true);
    expect(res.html).toBe('<p>one</p><p>two</p>');
  });

  it('removes stray line breaks between block elements', () => {
    // Google Docs wraps pasted content in a `<b>` tag and uses `<br>` to
    // represent empty lines.
    const res = clean(
      '<b id="docs-internal-guid-1" style="font-weight:normal;">' +
        '<p dir="ltr"><span>one</span></p><br><br>' +
        '<p dir="ltr"><span>two</span></p>' +
        '</b>'
    );
    expect(res.modified).toBe(true);
    expect(res.html).toBe(
      '<b id="docs-internal-guid-1" style="font-weight:normal;">' +
        '<p dir="ltr"><span>one</span></p>' +
        '<p dir="ltr"><span>two</span></p>' +
        '</b>'
    );
  });

  it('preserves line breaks within a paragraph', () => {
    const res = clean('<p>one<br>two</p>');
    expect(res.modified).toBe(false);
    expect(res.html).toBe('<p>one<br>two</p>');
  });

  it('removes blank wrappers and list items', () => {
    const res = clean(
      '<p>one</p><div><p><br></p></div><ul><li>a</li><li></li></ul>'
    );
    expect(res.modified).toBe(true);
    expect(res.html).toBe('<p>one</p><ul><li>a</li></ul>');
  });

  it('keeps blocks that render media', () => {
    const res = clean('<p>one</p><p><img src="foo.png"></p><p></p>');
    expect(res.modified).toBe(true);
    expect(res.html).toBe('<p>one</p><p><img src="foo.png"></p>');
  });

  it('keeps empty table cells', () => {
    const res = clean(
      '<table><tbody><tr><td>a</td><td></td></tr></tbody></table>'
    );
    expect(res.modified).toBe(false);
    expect(res.html).toBe(
      '<table><tbody><tr><td>a</td><td></td></tr></tbody></table>'
    );
  });

  it('leaves blank-only pastes untouched', () => {
    const res = clean('<p><br></p>');
    expect(res.modified).toBe(false);
    expect(res.html).toBe('<p><br></p>');
  });

  it('removes underlines from spans inside links', () => {
    const res = clean(
      '<a href="#" style="text-decoration:none;">' +
        '<span style="color:#000;text-decoration:underline;">link</span></a>'
    );
    expect(res.modified).toBe(true);
    expect(res.html).toContain('color: rgb(0, 0, 0);');
    expect(res.html).not.toContain('underline');
  });

  it('removes text-align styles', () => {
    const res = clean('<p style="text-align:center;">one</p>');
    expect(res.modified).toBe(true);
    expect(res.html).toBe('<p style="">one</p>');
  });

  it('is a no-op for clean html', () => {
    const res = clean('<p>one</p><h2>two</h2><p>three</p>');
    expect(res.modified).toBe(false);
    expect(res.html).toBe('<p>one</p><h2>two</h2><p>three</p>');
  });
});
