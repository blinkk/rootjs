import {describe, expect, it} from 'vitest';
import {
  escapeInlineCss,
  resolveEditorTheme,
  themeStylesheetUrl,
} from './editor-theme.js';

describe('themeStylesheetUrl', () => {
  it('maps a theme name to its stylesheet under /cms/static/themes', () => {
    expect(themeStylesheetUrl('clarity')).toBe(
      '/cms/static/themes/clarity.css'
    );
    expect(themeStylesheetUrl('my-theme-2')).toBe(
      '/cms/static/themes/my-theme-2.css'
    );
  });

  it('returns null when no theme is set', () => {
    expect(themeStylesheetUrl(undefined)).toBe(null);
    expect(themeStylesheetUrl('')).toBe(null);
  });

  it('rejects names that are not plain file names', () => {
    expect(themeStylesheetUrl('../ui')).toBe(null);
    expect(themeStylesheetUrl('clarity.css')).toBe(null);
    expect(themeStylesheetUrl('Nested')).toBe(null);
    expect(themeStylesheetUrl('a b')).toBe(null);
  });
});

describe('escapeInlineCss', () => {
  it('leaves ordinary css alone', () => {
    const css = ':root { --cms-drawer-indent: 20px; } /* a > b */';
    expect(escapeInlineCss(css)).toBe(css);
  });

  it('keeps a stray end tag from closing the style element', () => {
    expect(escapeInlineCss('a::after { content: "</style>"; }')).toBe(
      'a::after { content: "<\\/style>"; }'
    );
    expect(escapeInlineCss('/* </STYLE> */')).toBe('/* <\\/STYLE> */');
  });

  it('escapes every occurrence', () => {
    expect(escapeInlineCss('</style></style>')).toBe('<\\/style><\\/style>');
  });
});

describe('resolveEditorTheme', () => {
  it('loads nothing extra when no theme is configured', () => {
    expect(resolveEditorTheme(undefined)).toEqual({
      stylesheetUrl: null,
      inlineCss: null,
    });
  });

  it('treats a string as a built-in theme used as-is', () => {
    expect(resolveEditorTheme('clarity')).toEqual({
      stylesheetUrl: '/cms/static/themes/clarity.css',
      inlineCss: null,
    });
  });

  it('extends a built-in theme with inline css', () => {
    expect(
      resolveEditorTheme({
        extends: 'clarity',
        css: ':root { --cms-drawer-indent: 32px; }',
      })
    ).toEqual({
      stylesheetUrl: '/cms/static/themes/clarity.css',
      inlineCss: ':root { --cms-drawer-indent: 32px; }',
    });
  });

  it('starts from scratch when only css is given', () => {
    expect(resolveEditorTheme({css: 'body { color: red; }'})).toEqual({
      stylesheetUrl: null,
      inlineCss: 'body { color: red; }',
    });
  });

  it('escapes the inline css', () => {
    expect(resolveEditorTheme({css: '/* </style> */'}).inlineCss).toBe(
      '/* <\\/style> */'
    );
  });

  it('warns about, and drops, an invalid built-in name', () => {
    const resolved = resolveEditorTheme({extends: '../x', css: 'a {}'});
    expect(resolved.stylesheetUrl).toBe(null);
    expect(resolved.inlineCss).toBe('a {}');
    expect(resolved.warning).toContain('../x');
  });
});
