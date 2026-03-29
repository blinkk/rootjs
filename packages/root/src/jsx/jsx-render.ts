import {VNode, Fragment, options as preactOptions} from 'preact';

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
};

const AMP = '&amp;';
const LT = '&lt;';
const GT = '&gt;';
const QUOT = '&quot;';

function escapeHtml(str: string): string {
  let out = '';
  let last = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    let escaped: string | undefined;
    if (ch === 38) escaped = AMP;
    else if (ch === 60) escaped = LT;
    else if (ch === 62) escaped = GT;
    if (escaped) {
      out += str.slice(last, i) + escaped;
      last = i + 1;
    }
  }
  return last === 0 ? str : out + str.slice(last);
}

function escapeAttr(str: string): string {
  let out = '';
  let last = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    let escaped: string | undefined;
    if (ch === 38) escaped = AMP;
    else if (ch === 34) escaped = QUOT;
    else if (ch === 60) escaped = LT;
    else if (ch === 62) escaped = GT;
    if (escaped) {
      out += str.slice(last, i) + escaped;
      last = i + 1;
    }
  }
  return last === 0 ? str : out + str.slice(last);
}

function styleToString(style: Record<string, any>): string {
  const parts: string[] = [];
  for (const key in style) {
    const value = style[key];
    if (value == null || value === '') continue;
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

  function render(node: any): string {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node === 'string') return escapeHtml(node);
    if (typeof node === 'number' || typeof node === 'bigint')
      return String(node);
    if (Array.isArray(node)) return node.map(render).join('');

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
      return renderElement(type, props);
    }

    return '';
  }

  function renderComponent(vnode: VNode): string {
    const {type, props} = vnode;
    const fn = type as Function;

    // Detect context Provider.
    // Preact >=10.27: Provider === Context (same function). `fn.__c` is the
    //   context id string (e.g. "__cC0").
    // Preact <10.27:  Provider._contextRef (mangled `fn.__`) points to the
    //   context object which has `__c` (id) and `__` (default value).
    let contextId: string | undefined;
    const fnAny = fn as any;
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
      preactOptions.diffed?.(vnode);
    }
  }

  function renderElement(tag: string, props: Record<string, any>): string {
    const isBlock = isPretty && blockSet.has(tag);
    const isVoid = VOID_ELEMENTS.has(tag);

    let html = '<' + tag;
    html += renderAttrs(tag, props);
    html += '>';

    if (isVoid) {
      return isBlock ? html + '\n' : html;
    }

    let inner = '';
    if (props?.dangerouslySetInnerHTML?.__html != null) {
      inner = props.dangerouslySetInnerHTML.__html;
    } else if (props?.children != null) {
      inner = renderChildren(props.children);
    } else if (tag === 'textarea' && props) {
      // For <textarea>, render value/defaultValue as text content since
      // browsers ignore the value attribute on textarea elements.
      const textVal = props.value ?? props.defaultValue;
      if (textVal != null) {
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
        return html + '\n' + inner + '</' + tag + '>\n';
      }
      return html + inner + '</' + tag + '>\n';
    }

    return html + inner + '</' + tag + '>';
  }

  function renderAttrs(tag: string, props: Record<string, any>): string {
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
      // Skip value/defaultValue on textarea — rendered as text content.
      if (tag === 'textarea' && (key === 'value' || key === 'defaultValue')) {
        continue;
      }
      // Skip event handlers.
      if (key.length > 2 && key[0] === 'o' && key[1] === 'n') continue;

      let value = props[key];
      if (value == null || value === false) continue;

      const attrName = PROP_TO_ATTR[key] || key;

      // Boolean attributes.
      if (value === true) {
        result += ' ' + attrName;
        continue;
      }

      // Style objects.
      if (key === 'style' && typeof value === 'object') {
        value = styleToString(value);
        if (!value) continue;
      }

      result += ' ' + attrName + '="' + escapeAttr(String(value)) + '"';
    }
    return result;
  }

  function renderChildren(children: any): string {
    if (children == null) return '';
    if (Array.isArray(children)) {
      return children.map(render).join('');
    }
    return render(children);
  }

  return render(vnode);
}

function noop() {}
