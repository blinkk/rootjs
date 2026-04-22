import {options as preactOptions} from 'virtual:root-jsx';
import {VNode, Fragment} from './jsx-runtime.js';

/** HTML void elements (self-closing, no end tag). */
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

/** Tags whose text content may contain literal newlines that should not be treated as block-child indicators. */
const RAW_CONTENT_ELEMENTS = new Set(['pre', 'textarea', 'script', 'style']);

/** Standard HTML block-level elements. */
const DEFAULT_BLOCK_ELEMENTS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'body',
  'dd',
  'details',
  'dialog',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hgroup',
  'hr',
  'html',
  'li',
  'link',
  'main',
  'meta',
  'nav',
  'noscript',
  'ol',
  'p',
  'pre',
  'script',
  'search',
  'section',
  'style',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'title',
  'tr',
  'ul',
]);

/** JSX prop name -> HTML attribute name. */
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

  // SVG presentation attributes (camelCase -> kebab-case).
  clipPath: 'clip-path',
  clipRule: 'clip-rule',
  colorInterpolation: 'color-interpolation',
  colorInterpolationFilters: 'color-interpolation-filters',
  dominantBaseline: 'dominant-baseline',
  fillOpacity: 'fill-opacity',
  fillRule: 'fill-rule',
  floodColor: 'flood-color',
  floodOpacity: 'flood-opacity',
  imageRendering: 'image-rendering',
  letterSpacing: 'letter-spacing',
  lightingColor: 'lighting-color',
  markerEnd: 'marker-end',
  markerMid: 'marker-mid',
  markerStart: 'marker-start',
  paintOrder: 'paint-order',
  pointerEvents: 'pointer-events',
  shapeRendering: 'shape-rendering',
  stopColor: 'stop-color',
  stopOpacity: 'stop-opacity',
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
  transformOrigin: 'transform-origin',
  vectorEffect: 'vector-effect',
  wordSpacing: 'word-spacing',
  writingMode: 'writing-mode',
};

const AMP = '&amp;';
const LT = '&lt;';
const GT = '&gt;';
const QUOT = '&quot;';

/** Returns `true` when `value` is neither `null` nor `undefined`. */
function isDef<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function escapeHtml(str: string): string {
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

function escapeAttr(str: string): string {
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

function styleToString(style: Record<string, any>): string {
  const parts: string[] = [];
  for (const key in style) {
    const value = style[key];
    if (!isDef(value) || value === '') continue;
    // Convert camelCase to kebab-case.
    const cssKey = key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
    parts.push(`${cssKey}:${value}`);
  }
  return parts.join(';');
}

export interface JsxRenderOptions {
  /** Render mode. `'pretty'` adds newlines around block elements; `'minimal'` outputs compact HTML. Default: `'pretty'`. */
  mode?: 'pretty' | 'minimal';
  /** Additional tag names to treat as block-level elements in pretty mode. */
  blockElements?: string[];
}

/**
 * Renders a Preact VNode tree to an HTML string.
 */
export function renderJsxToString(
  vnode: VNode,
  options?: JsxRenderOptions
): string {
  const mode = options?.mode ?? 'pretty';
  const isPretty = mode === 'pretty';
  const blockSet = new Set(DEFAULT_BLOCK_ELEMENTS);
  if (options?.blockElements) {
    for (const el of options.blockElements) {
      blockSet.add(el);
    }
  }

  // Context stacks: context.__c (id) -> value[]
  const contextStacks = new Map<string, any[]>();

  function pushCtx(contextId: string, value: any) {
    let stack = contextStacks.get(contextId);
    if (!stack) {
      stack = [];
      contextStacks.set(contextId, stack);
    }
    stack.push(value);
  }

  function popCtx(contextId: string) {
    contextStacks.get(contextId)?.pop();
  }

  /** Builds the __n (global context) map for hooks. */
  function buildGlobalContext(): Record<string, any> {
    const globalCtx: Record<string, any> = {};
    for (const [contextId, stack] of contextStacks) {
      if (stack.length > 0) {
        // useContext expects provider.props.value and provider.sub().
        globalCtx[contextId] = {
          props: {value: stack[stack.length - 1]},
          sub: noop,
        };
      }
    }
    return globalCtx;
  }

  function render(node: any, inline?: boolean): string {
    if (!isDef(node) || typeof node === 'boolean') return '';
    if (typeof node === 'string') return escapeHtml(node);
    if (typeof node === 'number' || typeof node === 'bigint')
      return String(node);
    if (Array.isArray(node)) return node.map((n) => render(n, inline)).join('');

    // Must be a VNode-like object.
    if (typeof node !== 'object' || !('type' in node)) return '';

    const {type, props} = node;

    // Fragment.
    if (type === Fragment) {
      return renderChildren(props?.children);
    }

    // Component (function or class).
    if (typeof type === 'function') {
      return renderComponent(node);
    }

    // HTML element.
    if (typeof type === 'string') {
      return renderElement(type, props, inline);
    }

    return '';
  }

  function renderComponent(vnode: VNode): string {
    const {type, props} = vnode;
    const fn = type as Function;

    // Detect context Provider.
    // Root.js local JSX runtime: Provider._isProvider === true, Provider._context
    //   is the Context object with a _stack array.
    // Preact >=10.27: Provider === Context (same function). `fn.__c` is the
    //   context id string (e.g. "__cC0").
    // Preact <10.27:  Provider._contextRef (mangled `fn.__`) points to the
    //   context object which has `__c` (id) and `__` (default value).
    const fnAny = fn as any;
    if (fnAny._isProvider && fnAny._context) {
      const ctx = fnAny._context;
      ctx._stack.push((props as any).value);
      const result = renderChildren(props.children);
      ctx._stack.pop();
      return result;
    }
    let contextId: string | undefined;
    if (typeof fnAny.__c === 'string' && fnAny.__c.startsWith('__cC')) {
      contextId = fnAny.__c;
    } else if (fnAny.__ && typeof fnAny.__ === 'object' && fnAny.__.__c) {
      contextId = fnAny.__.__c;
    }
    if (contextId) {
      pushCtx(contextId, (props as any).value);
      const result = renderChildren(props.children);
      popCtx(contextId);
      return result;
    }

    // Detect context Consumer.
    if ((fn as any).contextType) {
      const ctx = (fn as any).contextType;
      const ctxId: string = ctx.__c;
      const stack = contextStacks.get(ctxId);
      const value =
        stack && stack.length > 0 ? stack[stack.length - 1] : ctx.__;
      if (typeof props.children === 'function') {
        return render(props.children(value));
      }
      return renderChildren(props.children);
    }

    // Regular component — set up a fake component instance so Preact hooks
    // (useContext, useState, useMemo, etc.) work during SSR.
    // Preact's useContext reads from `component.context[context.__c]`.
    const component: any = {
      props,
      context: buildGlobalContext(),
      state: {},
      __v: vnode, // _vnode
      __d: false, // _dirty
      __h: [], // _renderCallbacks
      __s: {}, // _nextState
      __H: null, // _hooks (initialised by hooks addon)
    };
    (vnode as any).__c = component;

    // Trigger Preact option hooks so the hooks addon can set currentComponent.
    (preactOptions as any).__b?.(vnode);
    (preactOptions as any).__r?.(vnode);

    try {
      // Class component.
      if (fn.prototype && fn.prototype.render) {
        const instance = new (fn as any)(props, component.context);
        instance.__n = component.__n;
        instance.__H = component.__H;
        (vnode as any).__c = instance;
        (preactOptions as any).__r?.(vnode);
        return render(instance.render(instance.props, instance.state));
      }

      // Functional component.
      const rendered = fn(props, component.context);
      return render(rendered);
    } finally {
      preactOptions.diffed?.(vnode as any);
    }
  }

  function renderElement(
    tag: string,
    props: Record<string, any>,
    inline?: boolean
  ): string {
    const isBlock = isPretty && !inline && blockSet.has(tag);
    const isVoid = VOID_ELEMENTS.has(tag);
    const attrs = renderAttrs(tag, props);
    let result = '<' + tag + attrs + '>';

    if (isVoid) {
      if (isBlock) result += '\n';
      return result;
    }

    let inner = '';
    if (isDef(props?.dangerouslySetInnerHTML?.__html)) {
      inner = props.dangerouslySetInnerHTML.__html;
    } else if (isDef(props?.children)) {
      inner = renderChildren(props.children);
    } else if (tag === 'textarea' && props) {
      // For <textarea>, render value/defaultValue as text content since
      // browsers ignore the value attribute on textarea elements.
      const textVal = props.value ?? props.defaultValue;
      if (isDef(textVal)) {
        inner = escapeHtml(String(textVal));
      }
    }

    if (isBlock) {
      // When inner content contains block children (indicated by newlines),
      // add a newline after the opening tag so content starts on its own line.
      // Exempt raw-content elements (pre, textarea, script, style) where
      // newlines are literal text, not block-child indicators.
      const hasBlockChildren =
        !RAW_CONTENT_ELEMENTS.has(tag) && inner.includes('\n');
      if (hasBlockChildren) {
        result += '\n' + inner + '</' + tag + '>\n';
      } else {
        result += inner + '</' + tag + '>\n';
      }
    } else {
      result += inner + '</' + tag + '>';
    }

    return result;
  }

  function renderAttrs(tag: string, props: Record<string, any>): string {
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
      // Skip value/defaultValue on textarea — rendered as text content.
      if (tag === 'textarea' && (key === 'value' || key === 'defaultValue')) {
        continue;
      }
      // Skip event handlers.
      if (key.length > 2 && key[0] === 'o' && key[1] === 'n') continue;

      let value = props[key];
      if (!isDef(value)) continue;
      // For standard and boolean attributes, `false` removes the attribute.
      // For data-* attributes, `false` is rendered as the string "false".
      if (value === false && !key.startsWith('data-')) continue;

      const attrName = PROP_TO_ATTR[key] || key;

      // Boolean attributes.
      if (value === true) {
        parts.push(' ', attrName);
        continue;
      }

      // Style objects.
      if (key === 'style' && typeof value === 'object') {
        value = styleToString(value);
        if (!value) continue;
      }

      parts.push(' ', attrName, '="', escapeAttr(String(value)), '"');
    }
    return parts.join('');
  }

  /**
   * Returns true if a child node is a text-like value (string, number).
   */
  function isTextNode(child: any): boolean {
    if (!isDef(child) || typeof child === 'boolean') return false;
    return (
      typeof child === 'string' ||
      typeof child === 'number' ||
      typeof child === 'bigint'
    );
  }

  /**
   * Checks if an array of children contains a mix of text nodes and elements.
   * When mixed, block elements should render inline to avoid breaking text flow.
   */
  function hasMixedContent(children: any[]): boolean {
    let hasText = false;
    let hasElement = false;
    for (const child of children) {
      if (isTextNode(child)) {
        hasText = true;
      } else if (isDef(child) && typeof child === 'object' && 'type' in child) {
        hasElement = true;
      }
      if (hasText && hasElement) return true;
    }
    return false;
  }

  function renderChildren(children: any): string {
    if (!isDef(children)) return '';
    if (Array.isArray(children)) {
      const inline = isPretty && hasMixedContent(children);
      return children.map((child) => render(child, inline)).join('');
    }
    return render(children);
  }

  return render(vnode);
}

function noop() {}
