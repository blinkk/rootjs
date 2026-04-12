/**
 * To run this benchmark:
 *
 * ```
 * pnpm vitest bench test/jsx-string-build.bench.ts
 * ```
 */
import {bench, describe} from 'vitest';

const AMP = '&amp;';
const LT = '&lt;';
const GT = '&gt;';
const QUOT = '&quot;';

const PROP_TO_ATTR: Record<string, string> = {
  acceptCharset: 'accept-charset',
  autoCapitalize: 'autocapitalize',
  autoComplete: 'autocomplete',
  autoFocus: 'autofocus',
  autoPlay: 'autoplay',
  charSet: 'charset',
  className: 'class',
  colSpan: 'colspan',
  contentEditable: 'contenteditable',
  crossOrigin: 'crossorigin',
  dateTime: 'datetime',
  encType: 'enctype',
  formAction: 'formaction',
  formEncType: 'formenctype',
  formMethod: 'formmethod',
  formNoValidate: 'formnovalidate',
  formTarget: 'formtarget',
  frameBorder: 'frameborder',
  hrefLang: 'hreflang',
  htmlFor: 'for',
  httpEquiv: 'http-equiv',
  inputMode: 'inputmode',
  itemProp: 'itemprop',
  itemRef: 'itemref',
  itemScope: 'itemscope',
  itemType: 'itemtype',
  maxLength: 'maxlength',
  mediaGroup: 'mediagroup',
  minLength: 'minlength',
  noModule: 'nomodule',
  noValidate: 'novalidate',
  playsInline: 'playsinline',
  readOnly: 'readonly',
  referrerPolicy: 'referrerpolicy',
  rowSpan: 'rowspan',
  spellCheck: 'spellcheck',
  srcDoc: 'srcdoc',
  srcLang: 'srclang',
  srcSet: 'srcset',
  tabIndex: 'tabindex',
  useMap: 'usemap',
};

const rawHtml =
  '<article class="hero & promo">Root.js <fast> SSR & hydration</article>';
const rawAttr =
  'hero" data-title="SSR & hydration <fast>" aria-label="Read > Learn"';
const styleObject = {
  backgroundColor: 'var(--surface)',
  borderTopLeftRadius: '16px',
  borderBottomRightRadius: '16px',
  color: '#222',
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  lineHeight: 1.4,
  marginTop: '24px',
  opacity: 0.98,
  paddingInline: 'clamp(16px, 4vw, 48px)',
};
const attrProps = {
  className: 'hero hero--feature',
  title: rawAttr,
  hidden: false,
  draggable: true,
  style: styleObject,
  'data-mode': 'preview',
  'data-count': 12,
  tabIndex: 0,
  role: 'region',
  children: 'ignored',
};

let sink = 0;

function isDef<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function escapeHtmlParts(str: string): string {
  const parts: string[] = [];
  let last = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    let escaped: string | undefined;
    if (ch === 38) escaped = AMP;
    else if (ch === 60) escaped = LT;
    else if (ch === 62) escaped = GT;
    if (escaped) {
      parts.push(str.slice(last, i), escaped);
      last = i + 1;
    }
  }
  if (last === 0) return str;
  parts.push(str.slice(last));
  return parts.join('');
}

function escapeHtmlConcat(str: string): string {
  let result = '';
  let last = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    let escaped: string | undefined;
    if (ch === 38) escaped = AMP;
    else if (ch === 60) escaped = LT;
    else if (ch === 62) escaped = GT;
    if (escaped) {
      result += str.slice(last, i) + escaped;
      last = i + 1;
    }
  }
  if (last === 0) return str;
  return result + str.slice(last);
}

function escapeAttrParts(str: string): string {
  const parts: string[] = [];
  let last = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    let escaped: string | undefined;
    if (ch === 38) escaped = AMP;
    else if (ch === 34) escaped = QUOT;
    else if (ch === 60) escaped = LT;
    else if (ch === 62) escaped = GT;
    if (escaped) {
      parts.push(str.slice(last, i), escaped);
      last = i + 1;
    }
  }
  if (last === 0) return str;
  parts.push(str.slice(last));
  return parts.join('');
}

function escapeAttrConcat(str: string): string {
  let result = '';
  let last = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    let escaped: string | undefined;
    if (ch === 38) escaped = AMP;
    else if (ch === 34) escaped = QUOT;
    else if (ch === 60) escaped = LT;
    else if (ch === 62) escaped = GT;
    if (escaped) {
      result += str.slice(last, i) + escaped;
      last = i + 1;
    }
  }
  if (last === 0) return str;
  return result + str.slice(last);
}

function styleToStringParts(style: Record<string, any>): string {
  const parts: string[] = [];
  for (const key in style) {
    const value = style[key];
    if (!isDef(value) || value === '') continue;
    const cssKey = key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
    parts.push(`${cssKey}:${value}`);
  }
  return parts.join(';');
}

function styleToStringConcat(style: Record<string, any>): string {
  let result = '';
  let first = true;
  for (const key in style) {
    const value = style[key];
    if (!isDef(value) || value === '') continue;
    const cssKey = key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
    if (!first) result += ';';
    result += `${cssKey}:${value}`;
    first = false;
  }
  return result;
}

function renderAttrsParts(tag: string, props: Record<string, any>): string {
  if (!props) return '';
  const parts: string[] = [];
  for (const key in props) {
    if (
      key === 'children' ||
      key === 'dangerouslySetInnerHTML' ||
      key === 'key' ||
      key === 'ref' ||
      key === '__self' ||
      key === '__source'
    ) {
      continue;
    }
    if (tag === 'textarea' && (key === 'value' || key === 'defaultValue')) {
      continue;
    }
    if (key.length > 2 && key[0] === 'o' && key[1] === 'n') continue;

    let value = props[key];
    if (!isDef(value)) continue;
    if (value === false && !key.startsWith('data-')) continue;

    const attrName = PROP_TO_ATTR[key] || key;
    if (value === true) {
      parts.push(' ', attrName);
      continue;
    }
    if (key === 'style' && typeof value === 'object') {
      value = styleToStringParts(value);
      if (!value) continue;
    }
    parts.push(' ', attrName, '="', escapeAttrParts(String(value)), '"');
  }
  return parts.join('');
}

function renderAttrsConcat(tag: string, props: Record<string, any>): string {
  if (!props) return '';
  let result = '';
  for (const key in props) {
    if (
      key === 'children' ||
      key === 'dangerouslySetInnerHTML' ||
      key === 'key' ||
      key === 'ref' ||
      key === '__self' ||
      key === '__source'
    ) {
      continue;
    }
    if (tag === 'textarea' && (key === 'value' || key === 'defaultValue')) {
      continue;
    }
    if (key.length > 2 && key[0] === 'o' && key[1] === 'n') continue;

    let value = props[key];
    if (!isDef(value)) continue;
    if (value === false && !key.startsWith('data-')) continue;

    const attrName = PROP_TO_ATTR[key] || key;
    if (value === true) {
      result += ' ' + attrName;
      continue;
    }
    if (key === 'style' && typeof value === 'object') {
      value = styleToStringConcat(value);
      if (!value) continue;
    }
    result += ' ' + attrName + '="' + escapeAttrConcat(String(value)) + '"';
  }
  return result;
}

function renderElementParts(tag: string, attrs: string, inner: string): string {
  const parts: string[] = ['<', tag, attrs, '>'];
  parts.push('\n', inner, '</', tag, '>\n');
  return parts.join('');
}

function renderElementConcat(
  tag: string,
  attrs: string,
  inner: string
): string {
  return '<' + tag + attrs + '>\n' + inner + '</' + tag + '>\n';
}

const renderedInner = `${escapeHtmlParts(
  rawHtml
)}\n<section>Nested content</section>`;
const renderedAttrsParts = renderAttrsParts('section', attrProps);
const renderedAttrsConcat = renderAttrsConcat('section', attrProps);

describe('jsx string building', () => {
  bench('escapeHtml parts.join', () => {
    sink ^= escapeHtmlParts(rawHtml).length;
  });

  bench('escapeHtml concatenation', () => {
    sink ^= escapeHtmlConcat(rawHtml).length;
  });

  bench('escapeAttr parts.join', () => {
    sink ^= escapeAttrParts(rawAttr).length;
  });

  bench('escapeAttr concatenation', () => {
    sink ^= escapeAttrConcat(rawAttr).length;
  });

  bench('styleToString parts.join', () => {
    sink ^= styleToStringParts(styleObject).length;
  });

  bench('styleToString concatenation', () => {
    sink ^= styleToStringConcat(styleObject).length;
  });

  bench('renderAttrs parts.join', () => {
    sink ^= renderAttrsParts('section', attrProps).length;
  });

  bench('renderAttrs concatenation', () => {
    sink ^= renderAttrsConcat('section', attrProps).length;
  });

  bench('renderElement parts.join', () => {
    sink ^= renderElementParts(
      'section',
      renderedAttrsParts,
      renderedInner
    ).length;
  });

  bench('renderElement concatenation', () => {
    sink ^= renderElementConcat(
      'section',
      renderedAttrsConcat,
      renderedInner
    ).length;
  });
});
