/**
 * Standalone browser runtime executed inside sandboxed (`sandbox="allow-scripts"`)
 * prototype artboard iframes. Compiles Tailwind v4 utilities on the fly via
 * `tailwindcss`'s pure-JS `compile()` API, reports layout and `[data-block-key]`
 * bounding boxes to the parent canvas, forwards block clicks, and serves
 * compiled HTML + CSS snapshots for `@2x` PNG/JPG exports.
 */

import {compile} from 'tailwindcss';
import TAILWIND_BASE_CSS from 'tailwindcss/index.css';
import {
  rewriteViewportUnits,
  type PrototypeBlockRect,
} from '../../../../shared/prototypes.js';

interface RenderMessage {
  type: 'proto:render';
  frameId: string;
  title?: string;
  html?: string;
  themeCss?: string;
  blockCss?: string;
  foldHeight?: number;
  standalone?: boolean;
}

interface RequestExportMessage {
  type: 'proto:request-export';
  frameId?: string;
  requestId: string;
}

type InboundMessage = RenderMessage | RequestExportMessage;

const UNSAFE_TAGS = new Set([
  'SCRIPT',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'META',
  'BASE',
  'LINK',
  'STYLE',
  'FORM',
]);
const UNSAFE_URL_RE = /^\s*(?:javascript|vbscript|data\s*:\s*text\/html)/i;

let currentFrameId = '';
let isStandalonePreview = false;
let cachedThemeKey: string | null = null;
let cachedCompiler: Awaited<ReturnType<typeof compile>> | null = null;
let renderSeq = 0;
let layoutRafId = 0;

/** Strips `@import`, `expression()`, and closing style tags defensively. */
function sanitizeRuntimeCss(css: string): string {
  if (!css) {
    return '';
  }
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return rewriteViewportUnits(
    withoutComments
      .replace(/@import\b[^;{}]*(?:;|\r?\n|$)/gi, '')
      .replace(/expression\s*\([^)]*\)/gi, '')
      .replace(/<\/style/gi, '')
  ).trim();
}

/** Ensures a `<style id="...">` element exists in `<head>` and returns it. */
function ensureStyleTag(id: string): HTMLStyleElement {
  // Looked up inside `<head>` only: block HTML may carry an element with the
  // same id, which `getElementById` would return instead.
  let el = document.head.querySelector<HTMLStyleElement>(`style#${id}`);
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.appendChild(el);
  }
  return el;
}

/** Ensures the `<main id="proto-root">` mount exists and returns it. */
function ensureRootEl(): HTMLElement {
  let el = document.getElementById('proto-root');
  if (!el) {
    el = document.createElement('main');
    el.id = 'proto-root';
    document.body.appendChild(el);
  }
  el.style.position = 'relative';
  return el;
}

/**
 * Parses incoming HTML into a detached template and strips any scripts,
 * inline event handlers, or unsafe URL schemes before mounting into the DOM.
 */
function buildSanitizedFragment(html: string): DocumentFragment {
  const tpl = document.createElement('template');
  tpl.innerHTML = html || '';
  const walker = document.createTreeWalker(
    tpl.content,
    NodeFilter.SHOW_ELEMENT
  );
  const toRemove: Element[] = [];

  let node = walker.nextNode() as Element | null;
  while (node) {
    if (UNSAFE_TAGS.has(node.tagName.toUpperCase())) {
      toRemove.push(node);
    } else {
      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) {
          node.removeAttribute(attr.name);
        } else if (
          (name === 'href' || name === 'src' || name === 'xlink:href') &&
          UNSAFE_URL_RE.test(attr.value)
        ) {
          node.removeAttribute(attr.name);
        }
      }
    }
    node = walker.nextNode() as Element | null;
  }

  for (const el of toRemove) {
    el.remove();
  }
  return tpl.content;
}

/** Collects all unique CSS class candidates from elements inside `root`. */
function collectClassCandidates(root: HTMLElement): string[] {
  const candidates = new Set<string>();
  const elements = root.querySelectorAll('[class]');
  for (let i = 0; i < elements.length; i++) {
    const classAttr = elements[i].getAttribute('class');
    if (!classAttr) {
      continue;
    }
    const parts = classAttr.trim().split(/\s+/);
    for (let j = 0; j < parts.length; j++) {
      if (parts[j]) {
        candidates.add(parts[j]);
      }
    }
  }
  return Array.from(candidates);
}

const TAILWIND_BASE_SOURCE = String(TAILWIND_BASE_CSS);

/** Compiles Tailwind v4 utilities for the given theme CSS and class candidates. */
async function compileTailwindCss(
  themeCss: string,
  candidates: string[]
): Promise<string> {
  if (!cachedCompiler || cachedThemeKey !== themeCss) {
    const baseSource = themeCss
      ? `${TAILWIND_BASE_SOURCE}\n${themeCss}`
      : TAILWIND_BASE_SOURCE;
    cachedCompiler = await compile(baseSource);
    cachedThemeKey = themeCss;
  }
  const built = cachedCompiler.build(candidates);
  return rewriteViewportUnits(built);
}

/** Measures the rendered height and `[data-block-key]` rects and notifies parent. */
function postLayoutNow() {
  if (!currentFrameId || isStandalonePreview || window.parent === window) {
    return;
  }
  const rootEl = ensureRootEl();
  const blockEls = rootEl.querySelectorAll<HTMLElement>(
    ':scope > section[data-block-key]'
  );
  const blockRects: PrototypeBlockRect[] = [];
  for (let i = 0; i < blockEls.length; i++) {
    const el = blockEls[i];
    const blockKey = el.getAttribute('data-block-key');
    if (!blockKey) {
      continue;
    }
    blockRects.push({
      blockKey,
      top: el.offsetTop,
      left: el.offsetLeft,
      width: el.offsetWidth,
      height: el.offsetHeight,
    });
  }
  const height = Math.ceil(
    Math.max(rootEl.scrollHeight, rootEl.offsetHeight, 1)
  );
  window.parent.postMessage(
    {
      type: 'proto:layout',
      frameId: currentFrameId,
      height,
      blockRects,
    },
    '*'
  );
}

/** Coalesces layout reports to one message per animation frame. */
function scheduleLayoutReport() {
  if (layoutRafId) {
    return;
  }
  layoutRafId = window.requestAnimationFrame(() => {
    layoutRafId = 0;
    postLayoutNow();
  });
}

/** Handles an incoming `proto:render` message from the parent artboard. */
async function handleRender(msg: RenderMessage) {
  const seq = ++renderSeq;
  currentFrameId = msg.frameId || '';
  if (typeof msg.title === 'string' && msg.title.trim()) {
    document.title = msg.title.trim();
  }

  const standalone = Boolean(msg.standalone) || window.parent === window;
  isStandalonePreview = standalone;
  if (standalone) {
    document.documentElement.style.setProperty('--proto-vh', '1vh');
  } else {
    const foldHeight =
      typeof msg.foldHeight === 'number' && Number.isFinite(msg.foldHeight)
        ? Math.max(300, msg.foldHeight)
        : 900;
    document.documentElement.style.setProperty(
      '--proto-vh',
      `${foldHeight / 100}px`
    );
  }

  const safeThemeCss = sanitizeRuntimeCss(msg.themeCss || '');
  const safeBlockCss = sanitizeRuntimeCss(msg.blockCss || '');

  const rootEl = ensureRootEl();
  const fragment = buildSanitizedFragment(msg.html || '');
  rootEl.replaceChildren(fragment);

  const themeStyle = ensureStyleTag('proto-theme');
  themeStyle.textContent = safeThemeCss;

  const blocksStyle = ensureStyleTag('proto-blocks');
  blocksStyle.textContent = safeBlockCss;

  const candidates = collectClassCandidates(rootEl);
  try {
    const compiledTw = await compileTailwindCss(safeThemeCss, candidates);
    // Discard stale async compiles if a newer render arrived in the meantime.
    if (seq !== renderSeq) {
      return;
    }
    const twStyle = ensureStyleTag('proto-tw');
    twStyle.textContent = compiledTw;
  } catch (err) {
    console.error('[prototype-runtime] tailwind compile failed:', err);
  }

  // Re-measure when any embedded images finish loading.
  const images = rootEl.querySelectorAll('img');
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (!img.complete) {
      img.addEventListener('load', scheduleLayoutReport, {once: true});
      img.addEventListener('error', scheduleLayoutReport, {once: true});
    }
  }

  postLayoutNow();
  scheduleLayoutReport();
}

/** Handles an incoming `proto:request-export` message from the parent artboard. */
function handleRequestExport(msg: RequestExportMessage) {
  if (msg.frameId && currentFrameId && msg.frameId !== currentFrameId) {
    return;
  }
  const rootEl = ensureRootEl();
  const themeCss = ensureStyleTag('proto-theme').textContent || '';
  const twCss = ensureStyleTag('proto-tw').textContent || '';
  const blockCss = ensureStyleTag('proto-blocks').textContent || '';
  const compiledCss = [themeCss, twCss, blockCss].filter(Boolean).join('\n\n');
  const width = Math.ceil(
    Math.max(document.documentElement.clientWidth, rootEl.scrollWidth, 1)
  );
  const height = Math.ceil(
    Math.max(rootEl.scrollHeight, rootEl.offsetHeight, 1)
  );

  window.parent.postMessage(
    {
      type: 'proto:export-payload',
      frameId: msg.frameId || currentFrameId,
      requestId: msg.requestId,
      html: rootEl.innerHTML,
      compiledCss,
      width,
      height,
    },
    '*'
  );
}

/** Boots the runtime inside the sandboxed iframe. */
function boot() {
  const rootEl = ensureRootEl();

  // Report layout changes automatically whenever rendered content resizes.
  if (typeof ResizeObserver !== 'undefined') {
    const resizeObserver = new ResizeObserver(() => {
      scheduleLayoutReport();
    });
    resizeObserver.observe(rootEl);
  }

  // Re-measure once web fonts finish loading so height reflects actual glyphs.
  if (document.fonts && typeof document.fonts.ready?.then === 'function') {
    void document.fonts.ready.then(() => {
      scheduleLayoutReport();
    });
  }

  // Prevent external navigation inside prototypes, support in-page hash jumps in
  // standalone preview tabs, and forward block clicks when embedded on canvas.
  rootEl.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (!target) {
      return;
    }
    const anchor = target.closest('a');
    if (anchor) {
      event.preventDefault();
      if (isStandalonePreview || window.parent === window) {
        const href = (anchor.getAttribute('href') || '').trim();
        if (href.startsWith('#') && href.length > 1) {
          const targetEl = document.getElementById(href.slice(1));
          targetEl?.scrollIntoView({behavior: 'smooth'});
        }
      }
    }
    if (isStandalonePreview || window.parent === window) {
      return;
    }
    const blockEl = target.closest('#proto-root > section[data-block-key]');
    const blockKey = blockEl?.getAttribute('data-block-key');
    if (blockKey && currentFrameId) {
      window.parent.postMessage(
        {
          type: 'proto:block-click',
          frameId: currentFrameId,
          blockKey,
        },
        '*'
      );
    }
  });

  const standaloneEl = document.getElementById('proto-standalone-data');
  if (standaloneEl?.textContent) {
    isStandalonePreview = true;
    try {
      const parsed = JSON.parse(standaloneEl.textContent) as Omit<
        RenderMessage,
        'type'
      >;
      void handleRender({
        type: 'proto:render',
        ...parsed,
        standalone: true,
      });
    } catch (err) {
      console.error('[prototype-runtime] failed to boot standalone data:', err);
    }
    return;
  }

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window.parent) {
      return;
    }
    const data = event.data as InboundMessage | null;
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') {
      return;
    }
    if (data.type === 'proto:render') {
      void handleRender(data);
    } else if (data.type === 'proto:request-export') {
      handleRequestExport(data);
    }
  });

  window.parent.postMessage({type: 'proto:ready'}, '*');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, {once: true});
} else {
  boot();
}
