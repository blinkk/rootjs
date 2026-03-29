/**
 * @module render
 *
 * Server-side rendering of VNodes to HTML strings. Handles HTML elements,
 * function components, fragments, context providers, and all standard
 * HTML attribute conventions.
 */

import type {
  VNode,
  ComponentChildren,
  FunctionalComponent,
  Context,
} from './jsx-runtime.js';
import {Fragment} from './jsx-runtime.js';

// =============================================================================
// Constants
// =============================================================================

/** HTML void elements that must not have a closing tag. */
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/** Maps JSX prop names to their HTML attribute equivalents. */
const PROP_TO_ATTR: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
  charSet: 'charset',
  crossOrigin: 'crossorigin',
  httpEquiv: 'http-equiv',
  tabIndex: 'tabindex',
  noModule: 'nomodule',
  formAction: 'formaction',
  formEncType: 'formenctype',
  formMethod: 'formmethod',
  formNoValidate: 'formnovalidate',
  formTarget: 'formtarget',
  autoComplete: 'autocomplete',
  autoFocus: 'autofocus',
  autoPlay: 'autoplay',
  encType: 'enctype',
  hrefLang: 'hreflang',
  inputMode: 'inputmode',
  maxLength: 'maxlength',
  minLength: 'minlength',
  noValidate: 'novalidate',
  readOnly: 'readonly',
  cellPadding: 'cellpadding',
  cellSpacing: 'cellspacing',
  colSpan: 'colspan',
  rowSpan: 'rowspan',
  srcDoc: 'srcdoc',
  srcLang: 'srclang',
  srcSet: 'srcset',
  useMap: 'usemap',
  accentHeight: 'accent-height',
  alignmentBaseline: 'alignment-baseline',
  clipPath: 'clip-path',
  clipRule: 'clip-rule',
  dominantBaseline: 'dominant-baseline',
  fillOpacity: 'fill-opacity',
  fillRule: 'fill-rule',
  floodColor: 'flood-color',
  floodOpacity: 'flood-opacity',
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontStyle: 'font-style',
  fontVariant: 'font-variant',
  fontWeight: 'font-weight',
  glyphOrientationHorizontal: 'glyph-orientation-horizontal',
  glyphOrientationVertical: 'glyph-orientation-vertical',
  imageRendering: 'image-rendering',
  letterSpacing: 'letter-spacing',
  lightingColor: 'lighting-color',
  markerEnd: 'marker-end',
  markerMid: 'marker-mid',
  markerStart: 'marker-start',
  overlinePosition: 'overline-position',
  overlineThickness: 'overline-thickness',
  paintOrder: 'paint-order',
  pointerEvents: 'pointer-events',
  shapeRendering: 'shape-rendering',
  stopColor: 'stop-color',
  stopOpacity: 'stop-opacity',
  strikethroughPosition: 'strikethrough-position',
  strikethroughThickness: 'strikethrough-thickness',
  strokeDasharray: 'stroke-dasharray',
  strokeDashoffset: 'stroke-dashoffset',
  strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin',
  strokeMiterlimit: 'stroke-miterlimit',
  strokeOpacity: 'stroke-opacity',
  strokeWidth: 'stroke-width',
  textAnchor: 'text-anchor',
  textDecoration: 'text-decoration',
  textRendering: 'text-rendering',
  underlinePosition: 'underline-position',
  underlineThickness: 'underline-thickness',
  unicodeBidi: 'unicode-bidi',
  vectorEffect: 'vector-effect',
  wordSpacing: 'word-spacing',
  writingMode: 'writing-mode',
  viewBox: 'viewBox',
  xlinkActuate: 'xlink:actuate',
  xlinkArcrole: 'xlink:arcrole',
  xlinkHref: 'xlink:href',
  xlinkRole: 'xlink:role',
  xlinkShow: 'xlink:show',
  xlinkTitle: 'xlink:title',
  xlinkType: 'xlink:type',
  xmlBase: 'xml:base',
  xmlLang: 'xml:lang',
  xmlSpace: 'xml:space',
  xmlns: 'xmlns',
  xmlnsXlink: 'xmlns:xlink',
};

/** Props that should not be rendered as HTML attributes. */
const SKIP_PROPS = new Set([
  'children',
  'key',
  'ref',
  'dangerouslySetInnerHTML',
  '__source',
  '__self',
]);

/**
 * CSS properties that accept unitless numeric values.
 * For all other CSS properties, numeric values get 'px' appended.
 */
const UNITLESS_CSS_PROPS = new Set([
  'animation-iteration-count',
  'border-image-outset',
  'border-image-slice',
  'border-image-width',
  'box-flex',
  'box-flex-group',
  'box-ordinal-group',
  'column-count',
  'columns',
  'flex',
  'flex-grow',
  'flex-positive',
  'flex-shrink',
  'flex-negative',
  'flex-order',
  'font-weight',
  'grid-area',
  'grid-column',
  'grid-column-end',
  'grid-column-span',
  'grid-column-start',
  'grid-row',
  'grid-row-end',
  'grid-row-span',
  'grid-row-start',
  'line-clamp',
  'line-height',
  'opacity',
  'order',
  'orphans',
  'tab-size',
  'widows',
  'z-index',
  'zoom',
  'fill-opacity',
  'flood-opacity',
  'stop-opacity',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
]);

// =============================================================================
// HTML Escaping
// =============================================================================

function escapeHtml(str: string): string {
  let out = '';
  let last = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    if (ch === 38) {
      // &
      out += str.substring(last, i) + '&amp;';
      last = i + 1;
    } else if (ch === 60) {
      // <
      out += str.substring(last, i) + '&lt;';
      last = i + 1;
    } else if (ch === 62) {
      // >
      out += str.substring(last, i) + '&gt;';
      last = i + 1;
    }
  }
  if (last === 0) return str;
  return out + str.substring(last);
}

function escapeAttr(str: string): string {
  let out = '';
  let last = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    if (ch === 34) {
      // "
      out += str.substring(last, i) + '&quot;';
      last = i + 1;
    } else if (ch === 38) {
      // &
      out += str.substring(last, i) + '&amp;';
      last = i + 1;
    }
  }
  if (last === 0) return str;
  return out + str.substring(last);
}

// =============================================================================
// Style Object Serialization
// =============================================================================

/**
 * Converts a camelCase CSS property name to kebab-case.
 * e.g. "backgroundColor" -> "background-color"
 * Handles vendor prefixes: "WebkitTransform" -> "-webkit-transform"
 */
function cssPropertyToKebab(prop: string): string {
  if (prop.startsWith('--')) return prop;
  return prop
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^(webkit|moz|ms|o)-/, '-$1-');
}

function styleToString(style: Record<string, string | number>): string {
  let css = '';
  for (const key in style) {
    const value = style[key];
    if (value == null || value === '') continue;
    const prop = cssPropertyToKebab(key);
    if (css) css += ';';
    if (typeof value === 'number' && value !== 0 && !UNITLESS_CSS_PROPS.has(prop)) {
      css += `${prop}:${value}px`;
    } else {
      css += `${prop}:${value}`;
    }
  }
  return css;
}

// =============================================================================
// Attribute Rendering
// =============================================================================

function renderAttr(name: string, value: any): string {
  if (SKIP_PROPS.has(name)) return '';
  if (value == null || value === false) return '';

  // Event handlers are not rendered in SSR.
  if (name.length > 2 && name[0] === 'o' && name[1] === 'n') {
    const third = name.charCodeAt(2);
    // Check if 3rd char is uppercase (A-Z = 65-90), indicating an event like onClick
    if (third >= 65 && third <= 90) return '';
  }

  const attrName = PROP_TO_ATTR[name] || name;

  if (value === true) {
    return ` ${attrName}`;
  }

  if (name === 'style' && typeof value === 'object') {
    const styleStr = styleToString(value);
    if (!styleStr) return '';
    return ` style="${escapeAttr(styleStr)}"`;
  }

  return ` ${attrName}="${escapeAttr(String(value))}"`;
}

// =============================================================================
// VNode Rendering
// =============================================================================

function renderChildren(children: ComponentChildren): string {
  if (children == null || typeof children === 'boolean') {
    return '';
  }
  if (typeof children === 'string') {
    return escapeHtml(children);
  }
  if (typeof children === 'number' || typeof children === 'bigint') {
    return String(children);
  }
  if (Array.isArray(children)) {
    let html = '';
    for (let i = 0; i < children.length; i++) {
      html += renderChildren(children[i]);
    }
    return html;
  }
  // VNode
  return renderVNode(children as VNode);
}

function renderVNode(vnode: any): string {
  // Null, undefined, boolean — render nothing.
  if (vnode == null || typeof vnode === 'boolean') {
    return '';
  }

  // Strings and numbers — render as text.
  if (typeof vnode === 'string') {
    return escapeHtml(vnode);
  }
  if (typeof vnode === 'number' || typeof vnode === 'bigint') {
    return String(vnode);
  }

  // Arrays — render each item.
  if (Array.isArray(vnode)) {
    let html = '';
    for (let i = 0; i < vnode.length; i++) {
      html += renderVNode(vnode[i]);
    }
    return html;
  }

  const {type, props} = vnode as VNode<any>;

  // Fragment — render children without a wrapper.
  if (type === Fragment) {
    return renderChildren(props.children);
  }

  // Function component.
  if (typeof type === 'function') {
    const fn = type as FunctionalComponent<any>;

    // Context Provider — push value, render children, pop value.
    if (fn._isProvider && fn._context) {
      const ctx = fn._context as Context<any>;
      ctx._stack.push((props as any).value);
      try {
        return renderChildren((props as any).children);
      } finally {
        ctx._stack.pop();
      }
    }

    // Regular function component — call it and render the result.
    const result = fn(props);
    if (result == null) {
      return '';
    }
    return renderVNode(result);
  }

  // HTML element.
  const tag = type as string;
  let html = `<${tag}`;

  // Render attributes.
  for (const key in props) {
    html += renderAttr(key, (props as any)[key]);
  }

  // Void elements — self-closing.
  if (VOID_ELEMENTS.has(tag)) {
    html += ' />';
    return html;
  }

  html += '>';

  // dangerouslySetInnerHTML — raw HTML injection.
  const dangerousHtml = (props as any).dangerouslySetInnerHTML;
  if (dangerousHtml && dangerousHtml.__html != null) {
    html += dangerousHtml.__html;
  } else {
    html += renderChildren((props as any).children);
  }

  html += `</${tag}>`;
  return html;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Renders a VNode tree to an HTML string. Designed for server-side rendering
 * (SSR/SSG). Handles function components, fragments, context providers,
 * HTML elements, and all standard JSX conventions.
 *
 * ```ts
 * import {renderToString} from './render.js';
 * import {jsx} from './jsx-runtime.js';
 *
 * const html = renderToString(jsx('div', {className: 'app'}, 'Hello'));
 * // => '<div class="app">Hello</div>'
 * ```
 */
export function renderToString(vnode: VNode<any> | null): string {
  if (vnode == null) {
    return '';
  }
  return renderVNode(vnode);
}
