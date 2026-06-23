/* eslint-disable n/no-extraneous-import */
import {options as preactOptions} from 'preact';
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

/**
 * Standard HTML block-level elements. Also includes the `<select>` content
 * model (`select`/`optgroup`/`option`) so that each `<option>` renders on its
 * own line in pretty mode, even though those tags aren't block-level per CSS.
 */
const DEFAULT_BLOCK_ELEMENTS = new Set([
  'address',
  'article',
  'aside',
  'base',
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
  'optgroup',
  'option',
  'p',
  'pre',
  'script',
  'search',
  'section',
  'select',
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

/**
 * Non-visual metadata and resource elements. These produce no inline rendered
 * content, so in pretty mode they always start on their own line — even inside
 * a parent with mixed text/element children, where the inline heuristic would
 * otherwise keep all siblings on a single line. (`base`/`link`/`meta` are void;
 * `script`/`style`/`title` render no visible text.)
 */
const ALWAYS_BLOCK_ELEMENTS = new Set([
  'base',
  'link',
  'meta',
  'script',
  'style',
  'title',
]);

// Combined per-tag classification flags for the pretty-mode renderer. Each
// element in `renderElement` needs to know whether a tag is void, an
// always-block element, a raw-content element, and a default block-level
// element. These classifications are static (they never depend on render
// options), so they are precomputed into a single `Map<tag, bitmask>` lookup —
// one hash probe per element instead of four separate `Set.has` probes. Tags
// absent from the map (the common inline elements like `span`/`a`/`em`) return
// `undefined`, treated as flags 0. Runtime-configured block elements
// (`options.blockElements`) are handled by a separate, usually-absent set so
// the common path stays a single lookup.
const TAG_FLAG_VOID = 1;
const TAG_FLAG_ALWAYS_BLOCK = 2;
const TAG_FLAG_RAW = 4;
const TAG_FLAG_BLOCK = 8;
const TAG_STATIC_FLAGS = new Map<string, number>();
for (const t of VOID_ELEMENTS) {
  TAG_STATIC_FLAGS.set(t, (TAG_STATIC_FLAGS.get(t) || 0) | TAG_FLAG_VOID);
}
for (const t of ALWAYS_BLOCK_ELEMENTS) {
  TAG_STATIC_FLAGS.set(
    t,
    (TAG_STATIC_FLAGS.get(t) || 0) | TAG_FLAG_ALWAYS_BLOCK
  );
}
for (const t of RAW_CONTENT_ELEMENTS) {
  TAG_STATIC_FLAGS.set(t, (TAG_STATIC_FLAGS.get(t) || 0) | TAG_FLAG_RAW);
}
for (const t of DEFAULT_BLOCK_ELEMENTS) {
  TAG_STATIC_FLAGS.set(t, (TAG_STATIC_FLAGS.get(t) || 0) | TAG_FLAG_BLOCK);
}

/**
 * HTML/SVG boolean attributes.
 * When present with a truthy value, render as a minimized attribute.
 */
const BOOLEAN_ATTRS = new Set([
  'allowfullscreen',
  'async',
  'autofocus',
  'autoplay',
  'capture',
  'checked',
  'controls',
  'default',
  'defer',
  'disabled',
  'disableremoteplayback',
  'download',
  'draggable',
  'formnovalidate',
  'hidden',
  'inert',
  'ismap',
  'itemscope',
  'loop',
  'multiple',
  'muted',
  'nomodule',
  'novalidate',
  'open',
  'playsinline',
  'popover',
  'readonly',
  'required',
  'reversed',
  'selected',
]);

/**
 * JSX prop name -> HTML attribute name.
 *
 * A null-prototype object so that the very common "no remapping needed" lookup
 * (`class`, `href`, `id`, `data-*`, `aria-*`, etc., none of which are keys here)
 * misses without walking the `Object.prototype` chain. `renderAttrs` performs
 * one lookup per attribute, so for attribute-heavy trees this is a hot path.
 */
const PROP_TO_ATTR: Record<string, string> = Object.assign(
  Object.create(null),
  {
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
    disableRemotePlayback: 'disableremoteplayback',
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
  }
);

const AMP = '&amp;';
const LT = '&lt;';
const GT = '&gt;';
const QUOT = '&quot;';

// Single-pass native prechecks for the common case where a string needs no
// escaping (most class names, URLs, and text). `RegExp.test` scans in native
// code, which is substantially faster than the JS `charCodeAt` loop below, so
// strings that don't match return immediately without entering the loop.
const HTML_ESCAPE_RE = /[&<>]/;
const ATTR_ESCAPE_RE = /[&<>"]/;

// Shared empty object reused as the per-component context map when no contexts
// have ever been pushed. Components only ever read from this map, so sharing is
// safe and avoids a per-render allocation in the common case.
const EMPTY_GLOBAL_CTX: Record<string, any> = {};

/** Returns `true` when `value` is neither `null` nor `undefined`. */
function isDef<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function escapeHtml(str: string): string {
  if (!HTML_ESCAPE_RE.test(str)) return str;
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
  return result + str.slice(last);
}

function escapeAttr(str: string): string {
  if (!ATTR_ESCAPE_RE.test(str)) return str;
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
  return result + str.slice(last);
}

const STYLE_KEY_CACHE = new Map<string, string>();
const UPPERCASE_RE = /[A-Z]/g;

function toKebabCase(key: string): string {
  let cached = STYLE_KEY_CACHE.get(key);
  if (cached === undefined) {
    cached = key.replace(UPPERCASE_RE, (m) => '-' + m.toLowerCase());
    STYLE_KEY_CACHE.set(key, cached);
  }
  return cached;
}

function styleToString(style: Record<string, any>): string {
  let result = '';
  let first = true;
  for (const key in style) {
    const value = style[key];
    if (!isDef(value) || value === '') continue;
    if (first) {
      first = false;
    } else {
      result += ';';
    }
    result += `${toKebabCase(key)}:${value}`;
  }
  return result;
}

/**
 * JSX render mode. `'pretty'` adds newlines around block elements; `'minimal'`
 * outputs compact HTML.
 */
export type JsxRenderMode = 'pretty' | 'minimal';

export interface JsxRenderOptions {
  /** Render mode. `'pretty'` adds newlines around block elements; `'minimal'` outputs compact HTML. Default: `'pretty'`. */
  mode?: JsxRenderMode;
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
  // Default block-level elements are baked into the module-level
  // `TAG_STATIC_FLAGS` map (the `TAG_FLAG_BLOCK` bit), so the common case needs
  // no per-render set. Only when the caller supplies extra `blockElements` do we
  // build a small `customBlockSet` of just those additions; `renderElement`
  // consults it via a cheap "is it defined?" guard that is `undefined` (and so
  // skipped) in the common case.
  let customBlockSet: Set<string> | undefined;
  if (isPretty && options?.blockElements && options.blockElements.length > 0) {
    customBlockSet = new Set<string>();
    for (const el of options.blockElements) {
      // Only track elements that aren't already default block elements, so the
      // set stays empty (and the guard stays cheap) for redundant config.
      if (!DEFAULT_BLOCK_ELEMENTS.has(el)) {
        customBlockSet.add(el);
      }
    }
    if (customBlockSet.size === 0) {
      customBlockSet = undefined;
    }
  }

  // Context stacks: context.__c (id) -> value[]
  let contextStacks: Map<string, any[]> | undefined;

  // Version counter that bumps whenever a context value is pushed or popped.
  // `buildGlobalContext` uses it to skip rebuilding when nothing changed
  // between sibling component renders (the common case).
  let ctxVersion = 0;
  let cachedGlobalCtx: Record<string, any> = EMPTY_GLOBAL_CTX;
  let cachedGlobalCtxVersion = 0;

  // Side-channel reporting whether the most recently returned render string
  // contains a newline. Pretty mode uses this to decide whether a block
  // element's children start on their own line, instead of re-scanning the
  // element's concatenated inner HTML via `inner.includes('\n')`. Because block
  // elements nest, that rescan walked the same characters once per enclosing
  // block level (O(html_size * block_depth)); threading the flag up makes it a
  // single pass. This is safe because rendering is fully synchronous and
  // single-pass: every code path assigns `nlFlag` before returning, and each
  // caller reads it immediately after the call, before the next call can
  // overwrite it. It is only meaningful in pretty mode; in minimal mode the
  // leaf scans are skipped and the value is never read.
  let nlFlag = false;

  function pushCtx(contextId: string, value: any) {
    if (!contextStacks) {
      contextStacks = new Map<string, any[]>();
    }
    let stack = contextStacks.get(contextId);
    if (!stack) {
      stack = [];
      contextStacks.set(contextId, stack);
    }
    stack.push(value);
    ctxVersion++;
  }

  function popCtx(contextId: string) {
    const stack = contextStacks?.get(contextId);
    if (stack) {
      stack.pop();
      if (stack.length === 0) {
        contextStacks?.delete(contextId);
      }
    }
    ctxVersion++;
  }

  /** Builds the __n (global context) map for hooks. */
  function buildGlobalContext(): Record<string, any> {
    if (ctxVersion === cachedGlobalCtxVersion) return cachedGlobalCtx;
    if (!contextStacks || contextStacks.size === 0) {
      cachedGlobalCtx = EMPTY_GLOBAL_CTX;
      cachedGlobalCtxVersion = ctxVersion;
      return cachedGlobalCtx;
    }
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
    cachedGlobalCtx = globalCtx;
    cachedGlobalCtxVersion = ctxVersion;
    return globalCtx;
  }

  function render(node: any, inline?: boolean): string {
    const t = typeof node;
    if (t === 'string') {
      // escapeHtml only replaces &<>, so it never adds or removes newlines; the
      // raw text's newline status is preserved. Each text node is scanned once
      // here, never re-walked by ancestors. (`render` is only reached in pretty
      // mode — minimal mode uses `mRender` — so the scan always applies.)
      nlFlag = node.indexOf('\n') >= 0;
      return escapeHtml(node);
    }
    if (t === 'object') {
      if (node === null) {
        nlFlag = false;
        return '';
      }
      if (Array.isArray(node)) {
        let out = '';
        let anyNewline = false;
        for (let i = 0; i < node.length; i++) {
          const child = node[i];
          // Inline the string leaf (the most common array entry) to skip a
          // recursive `render` dispatch. This mirrors the string branch above
          // exactly: escape the text and record whether it contains a newline.
          if (typeof child === 'string') {
            out += escapeHtml(child);
            anyNewline = anyNewline || child.indexOf('\n') >= 0;
          } else {
            out += render(child, inline);
            anyNewline = anyNewline || nlFlag;
          }
        }
        nlFlag = anyNewline;
        return out;
      }
      // Must be a VNode-like object.
      if (!('type' in node)) {
        nlFlag = false;
        return '';
      }
      const type = node.type;
      // HTML element (the most common VNode shape).
      if (typeof type === 'string') {
        return renderElement(type, node.props, inline);
      }
      // Fragment.
      if (type === Fragment) {
        return renderChildren(node.props ? node.props.children : undefined);
      }
      // Component (function or class).
      if (typeof type === 'function') {
        return renderComponent(node);
      }
      return '';
    }
    if (t === 'number' || t === 'bigint') {
      nlFlag = false;
      return String(node);
    }
    // boolean, undefined, function, symbol: render to nothing.
    nlFlag = false;
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
      const result = activeChildren(props.children);
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
      const result = activeChildren(props.children);
      popCtx(contextId);
      return result;
    }

    // Detect context Consumer.
    if ((fn as any).contextType) {
      const ctx = (fn as any).contextType;
      const ctxId: string = ctx.__c;
      const stack = contextStacks?.get(ctxId);
      const value =
        stack && stack.length > 0 ? stack[stack.length - 1] : ctx.__;
      if (typeof props.children === 'function') {
        return activeRender(props.children(value));
      }
      return activeChildren(props.children);
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
        return activeRender(instance.render(instance.props, instance.state));
      }

      // Functional component.
      const rendered = fn(props, component.context);
      return activeRender(rendered);
    } finally {
      preactOptions.diffed?.(vnode as any);
    }
  }

  function renderElement(
    tag: string,
    props: Record<string, any>,
    inline?: boolean
  ): string {
    // One combined lookup for the static (void / always-block / raw-content /
    // default-block) classifications, instead of separate `Set.has` probes.
    // Inline elements (span/a/em/strong/…) miss the map entirely and resolve
    // to 0.
    const flags = TAG_STATIC_FLAGS.get(tag) || 0;
    // Metadata/resource elements always break onto their own line, even within
    // mixed (text + element) content where the inline heuristic applies, since
    // they render no inline visual output. (`renderElement` is only reached in
    // pretty mode — minimal mode uses `mElement` — so the block logic always
    // applies; no `isPretty` guard needed.) `customBlockSet` is consulted only
    // for runtime-configured block elements and is `undefined` (skipped) in the
    // common case.
    const isBlock =
      (flags & TAG_FLAG_ALWAYS_BLOCK) !== 0 ||
      (!inline &&
        ((flags & TAG_FLAG_BLOCK) !== 0 ||
          (customBlockSet !== undefined && customBlockSet.has(tag))));
    const attrs = renderAttrs(tag, props);
    const openTag = '<' + tag + attrs + '>';

    if ((flags & TAG_FLAG_VOID) !== 0) {
      if (isBlock) {
        nlFlag = true;
        return openTag + '\n';
      }
      nlFlag = false;
      return openTag;
    }

    let inner = '';
    // Whether `inner` contains a newline. For the children path this is read
    // from `nlFlag` (threaded up from the recursive render, no rescan). For the
    // raw-HTML and textarea leaf paths the string is scanned once here.
    let innerHasNewline = false;
    if (props) {
      const dsih = props.dangerouslySetInnerHTML;
      if (dsih && dsih.__html != null) {
        inner = dsih.__html;
        innerHasNewline = inner.includes('\n');
      } else if (props.children != null) {
        const children = props.children;
        // Inline the single string child (e.g. `<h3>Title</h3>`) — the most
        // common element body — to skip a `renderChildren`/`render` dispatch.
        // Mirrors the string branch of `render`.
        if (typeof children === 'string') {
          inner = escapeHtml(children);
          innerHasNewline = children.indexOf('\n') >= 0;
        } else {
          inner = renderChildren(children);
          innerHasNewline = nlFlag;
        }
      } else if (tag === 'textarea') {
        // For <textarea>, render value/defaultValue as text content since
        // browsers ignore the value attribute on textarea elements.
        const textVal = props.value ?? props.defaultValue;
        if (textVal != null) {
          inner = escapeHtml(String(textVal));
          innerHasNewline = inner.includes('\n');
        }
      }
    }

    if (isBlock) {
      // Block elements always end with a trailing newline.
      nlFlag = true;
      // When inner content contains block children (indicated by newlines),
      // add a newline after the opening tag so content starts on its own line.
      // Exempt raw-content elements (pre, textarea, script, style) where
      // newlines are literal text, not block-child indicators.
      const hasBlockChildren = (flags & TAG_FLAG_RAW) === 0 && innerHasNewline;
      if (hasBlockChildren) {
        return openTag + '\n' + inner + '</' + tag + '>\n';
      }
      return openTag + inner + '</' + tag + '>\n';
    }
    // Opening/closing tags add no newlines, so the element's newline status is
    // exactly that of its inner content.
    nlFlag = innerHasNewline;
    return openTag + inner + '</' + tag + '>';
  }

  function renderAttrs(tag: string, props: Record<string, any>): string {
    if (!props) return '';
    const isTextarea = tag === 'textarea';
    let result = '';
    for (const key in props) {
      const value = props[key];
      // `null`/`undefined` props produce no attribute. Checking this first
      // short-circuits absent optional attributes immediately, before the
      // reserved-key string comparisons.
      if (value == null) continue;
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
      if (isTextarea && (key === 'value' || key === 'defaultValue')) {
        continue;
      }

      const attrName = PROP_TO_ATTR[key] || key;
      const valueType = typeof value;

      // Dispatch ordered by frequency: string and numeric attribute values are
      // by far the most common, so they are matched first.
      if (valueType === 'string') {
        result += ' ' + attrName + '="' + escapeAttr(value) + '"';
      } else if (valueType === 'number') {
        // A stringified number never contains characters that require HTML
        // escaping, so skip `escapeAttr` entirely.
        result += ' ' + attrName + '="' + value + '"';
      } else if (value === true) {
        // Boolean HTML attributes minimize to a bare attribute when `true`;
        // other attributes are stringified (e.g. id="true").
        result += BOOLEAN_ATTRS.has(attrName)
          ? ' ' + attrName
          : ' ' + attrName + '="true"';
      } else if (value === false) {
        // Boolean HTML attributes are removed when `false`; other attributes
        // are stringified (e.g. data-foo="false").
        if (!BOOLEAN_ATTRS.has(attrName)) {
          result += ' ' + attrName + '="false"';
        }
      } else if (valueType === 'function') {
        // Skip function-valued props such as event handlers (e.g.
        // onClick={fn}): client-side handler functions can't be serialized to
        // HTML. String-valued inline handlers (e.g. <select onChange="...">)
        // are preserved by the string branch above.
        continue;
      } else if (key === 'style' && valueType === 'object') {
        // Style objects serialize to a CSS string; an empty result is omitted.
        const styleStr = styleToString(value);
        if (styleStr) {
          result += ' ' + attrName + '="' + escapeAttr(styleStr) + '"';
        }
      } else {
        result += ' ' + attrName + '="' + escapeAttr(String(value)) + '"';
      }
    }
    return result;
  }

  /**
   * Checks if an array of children contains a mix of text nodes and elements.
   * When mixed, block elements should render inline to avoid breaking text flow.
   * The per-child type checks are inlined (rather than calling `isTextNode`)
   * because this scans every child of every element in pretty mode.
   */
  function hasMixedContent(children: any[]): boolean {
    let hasText = false;
    let hasElement = false;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const t = typeof child;
      if (t === 'string' || t === 'number' || t === 'bigint') {
        hasText = true;
      } else if (t === 'object' && child !== null && 'type' in child) {
        hasElement = true;
      }
      if (hasText && hasElement) return true;
    }
    return false;
  }

  function renderChildren(children: any): string {
    if (children == null) {
      nlFlag = false;
      return '';
    }
    if (Array.isArray(children)) {
      // `renderChildren` is only reached in pretty mode (minimal uses
      // `mChildren`), so the mixed-content scan always applies.
      const inline = hasMixedContent(children);
      let out = '';
      let anyNewline = false;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        // Inline the string leaf to skip a recursive `render` dispatch (mirrors
        // the string branch of `render`).
        if (typeof child === 'string') {
          out += escapeHtml(child);
          anyNewline = anyNewline || child.indexOf('\n') >= 0;
        } else {
          out += render(child, inline);
          anyNewline = anyNewline || nlFlag;
        }
      }
      nlFlag = anyNewline;
      return out;
    }
    return render(children);
  }

  // ---------------------------------------------------------------------------
  // Minimal-mode fast path.
  //
  // Minimal mode emits compact HTML with no formatting, so it needs none of the
  // pretty-mode bookkeeping that `render`/`renderChildren`/`renderElement`
  // carry: the `nlFlag` newline side-channel, the `inline` parameter,
  // block-element detection, and the mixed-content scan. These dedicated
  // functions drop all of it, which removes those closure reads/writes and
  // branches from the hottest traversal loop. Each accumulates into a local
  // string and returns it (locals beat a shared closure-level buffer, and V8
  // represents the `+` concatenations as cheap rope/cons strings that flatten
  // once at the end). Output is byte-identical to the unified path in minimal
  // mode; the test suite asserts this across all element/attribute shapes.
  //
  // `renderComponent` is shared between modes via the `activeRender` /
  // `activeChildren` indirection assigned below: in minimal mode a component's
  // rendered subtree continues down `mRender`/`mChildren`, in pretty mode down
  // `render`/`renderChildren`.
  // ---------------------------------------------------------------------------

  function mRender(node: any): string {
    const t = typeof node;
    if (t === 'string') {
      return escapeHtml(node);
    }
    if (t === 'object') {
      if (node === null) {
        return '';
      }
      if (Array.isArray(node)) {
        let out = '';
        for (let i = 0; i < node.length; i++) {
          const child = node[i];
          // Inline the string leaf (the most common array entry) to skip a
          // recursive `mRender` dispatch; `mRender('...')` is exactly
          // `escapeHtml('...')`.
          out += typeof child === 'string' ? escapeHtml(child) : mRender(child);
        }
        return out;
      }
      if (!('type' in node)) {
        return '';
      }
      const type = node.type;
      if (typeof type === 'string') {
        return mElement(type, node.props);
      }
      if (type === Fragment) {
        return mChildren(node.props ? node.props.children : undefined);
      }
      if (typeof type === 'function') {
        return renderComponent(node);
      }
      return '';
    }
    if (t === 'number' || t === 'bigint') {
      return String(node);
    }
    return '';
  }

  function mElement(tag: string, props: Record<string, any>): string {
    const attrs = renderAttrs(tag, props);
    if (VOID_ELEMENTS.has(tag)) {
      return '<' + tag + attrs + '>';
    }
    let inner = '';
    if (props) {
      const dsih = props.dangerouslySetInnerHTML;
      if (dsih && dsih.__html != null) {
        inner = dsih.__html;
      } else {
        const children = props.children;
        if (children != null) {
          // Inline the single string child (e.g. `<h3>Title</h3>`,
          // `<li>Tag</li>`) — the most common element body — so it skips a
          // `mChildren` call; `mChildren('...')` is exactly `escapeHtml('...')`.
          inner =
            typeof children === 'string'
              ? escapeHtml(children)
              : mChildren(children);
        } else if (tag === 'textarea') {
          // For <textarea>, render value/defaultValue as text content since
          // browsers ignore the value attribute on textarea elements.
          const textVal = props.value ?? props.defaultValue;
          if (textVal != null) {
            inner = escapeHtml(String(textVal));
          }
        }
      }
    }
    // Single multi-operand concatenation: V8 sizes and fills one flat string
    // rather than allocating a separate `open` intermediate first.
    return '<' + tag + attrs + '>' + inner + '</' + tag + '>';
  }

  function mChildren(children: any): string {
    if (children == null) {
      return '';
    }
    if (Array.isArray(children)) {
      let out = '';
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const t = typeof child;
        // Inline the two most common child shapes (text leaf and host element)
        // so they skip the general `mRender` type-dispatch. These mirror
        // `mRender` exactly: a string renders as `escapeHtml`, and an object
        // whose `type` is a string is a host element rendered via `mElement`.
        if (t === 'string') {
          out += escapeHtml(child);
        } else if (
          t === 'object' &&
          child !== null &&
          typeof child.type === 'string'
        ) {
          out += mElement(child.type, child.props);
        } else {
          out += mRender(child);
        }
      }
      return out;
    }
    // Single (non-array) child. Inline the same two common shapes so a
    // single-child chain (e.g. deeply nested `<div><div>…`) skips a `mRender`
    // dispatch at every level.
    const t = typeof children;
    if (t === 'string') {
      return escapeHtml(children);
    }
    if (
      t === 'object' &&
      children !== null &&
      typeof children.type === 'string'
    ) {
      return mElement(children.type, children.props);
    }
    return mRender(children);
  }

  // Select the active recursion functions once per render. Minimal mode uses
  // the lean `mRender`/`mChildren` fast path above; pretty mode uses the
  // newline-tracking `render`/`renderChildren`. `renderComponent` and the
  // context Consumer path call through these so component subtrees stay on the
  // correct path.
  const activeRender = isPretty ? render : mRender;
  const activeChildren = isPretty ? renderChildren : mChildren;
  return activeRender(vnode);
}

function noop() {}
