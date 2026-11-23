/**
 * Isomorphic (browser + Node) HTML/CSS sanitizer, theme CSS builder, fallback
 * wireframe generator, and sandboxed iframe `srcdoc` builder for Root CMS UX
 * Prototypes.
 */

import sanitizeHtml, {type IOptions} from 'sanitize-html';
import {
  getOrderedBlocks,
  rewriteViewportUnits,
  sanitizePrototypeThemeValue,
  UNSAFE_CSS_VALUE_RE,
  type PrototypeFrame,
  type PrototypeTheme,
  type SiteSchemaSummary,
} from './prototypes.js';

/** Semantic layout and inline SVG tags permitted inside prototype frames. */
const ALLOWED_PROTOTYPE_TAGS: string[] = [
  'section',
  'div',
  'header',
  'footer',
  'nav',
  'main',
  'article',
  'aside',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'span',
  'strong',
  'em',
  'small',
  'code',
  'pre',
  'ul',
  'ol',
  'li',
  'a',
  'button',
  'img',
  'figure',
  'figcaption',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'hr',
  'br',
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'line',
  'polyline',
  'polygon',
];

/** Attributes permitted on all prototype elements. */
const GLOBAL_ATTRIBUTES: string[] = [
  'class',
  'id',
  'style',
  'aria-*',
  'role',
  'title',
];

/** SVG geometry and stroke attributes permitted on inline SVG elements. */
const SVG_COMMON_ATTRIBUTES: string[] = [
  'width',
  'height',
  'viewBox',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'd',
  'cx',
  'cy',
  'r',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
  'rx',
  'ry',
  'xmlns',
  'preserveAspectRatio',
];

/** Allowed inline CSS property names for prototype elements. */
const ALLOWED_INLINE_STYLE_PROP_RE =
  /^(?:color|background|background-color|border(?:-[a-z-]+)?|padding(?:-[a-z-]+)?|margin(?:-[a-z-]+)?|gap|max-width|min-height|--[a-z0-9_-]+)$/i;

/** Default design tokens applied when a board theme omits a property. */
const DEFAULT_THEME_TOKENS = {
  colorBg: '#ffffff',
  colorSurface: '#f8fafc',
  colorFg: '#0f172a',
  colorMuted: '#64748b',
  colorPrimary: '#0f172a',
  colorOnPrimary: '#ffffff',
  colorBorder: '#e2e8f0',
  fontSans:
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontHeading:
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontMono:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  radius: '8px',
  containerMaxWidth: '1280px',
} as const;

/** Escapes characters for safe interpolation inside double-quoted HTML attributes. */
function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escapes HTML special characters for safe text or attribute interpolation. */
function escapeHtml(value: string): string {
  return escapeHtmlAttr(value).replace(/'/g, '&#39;');
}

/** Sanitizes an inline `style` attribute value against the safe property list. */
function sanitizeInlineStyle(rawStyle: string): string {
  if (!rawStyle) {
    return '';
  }
  const withoutComments = rawStyle.replace(/\/\*[\s\S]*?\*\//g, '');
  const declarations = withoutComments.split(';');
  const safeParts: string[] = [];

  for (const decl of declarations) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx <= 0) {
      continue;
    }
    const prop = decl.slice(0, colonIdx).trim();
    const val = decl.slice(colonIdx + 1).trim();
    if (!prop || !val) {
      continue;
    }
    if (!ALLOWED_INLINE_STYLE_PROP_RE.test(prop)) {
      continue;
    }
    if (UNSAFE_CSS_VALUE_RE.test(val)) {
      continue;
    }
    safeParts.push(`${prop}: ${rewriteViewportUnits(val)}`);
  }

  return safeParts.join('; ');
}

const SANITIZE_PROTOTYPE_HTML_OPTIONS: IOptions = {
  allowedTags: ALLOWED_PROTOTYPE_TAGS,
  allowedAttributes: {
    '*': GLOBAL_ATTRIBUTES,
    a: [...GLOBAL_ATTRIBUTES, 'href', 'target', 'rel'],
    button: [...GLOBAL_ATTRIBUTES, 'type', 'disabled'],
    img: [...GLOBAL_ATTRIBUTES, 'src', 'alt', 'width', 'height', 'loading'],
    th: [...GLOBAL_ATTRIBUTES, 'colspan', 'rowspan', 'scope'],
    td: [...GLOBAL_ATTRIBUTES, 'colspan', 'rowspan'],
    svg: [...GLOBAL_ATTRIBUTES, ...SVG_COMMON_ATTRIBUTES],
    g: [...GLOBAL_ATTRIBUTES, ...SVG_COMMON_ATTRIBUTES],
    path: [...GLOBAL_ATTRIBUTES, ...SVG_COMMON_ATTRIBUTES],
    rect: [...GLOBAL_ATTRIBUTES, ...SVG_COMMON_ATTRIBUTES],
    circle: [...GLOBAL_ATTRIBUTES, ...SVG_COMMON_ATTRIBUTES],
    line: [...GLOBAL_ATTRIBUTES, ...SVG_COMMON_ATTRIBUTES],
    polyline: [...GLOBAL_ATTRIBUTES, ...SVG_COMMON_ATTRIBUTES],
    polygon: [...GLOBAL_ATTRIBUTES, ...SVG_COMMON_ATTRIBUTES],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: {
    img: ['http', 'https', 'data', 'blob'],
  },
  allowProtocolRelative: false,
  parseStyleAttributes: false,
  disallowedTagsMode: 'discard',
  nonTextTags: [
    'style',
    'script',
    'textarea',
    'option',
    'noscript',
    'iframe',
    'object',
    'embed',
  ],
  parser: {
    lowerCaseAttributeNames: false,
  },
  transformTags: {
    '*': (tagName, attribs) => {
      const next = {...attribs};
      if (typeof next.style === 'string') {
        const sanitizedStyle = sanitizeInlineStyle(next.style);
        if (sanitizedStyle) {
          next.style = sanitizedStyle;
        } else {
          delete next.style;
        }
      }
      if (tagName === 'a' && next.target === '_blank') {
        next.rel = 'noopener noreferrer';
      }
      return {tagName, attribs: next};
    },
  },
};

/**
 * Sanitizes HTML markup for rendering inside a sandboxed prototype frame.
 * Allows semantic layout tags, inline SVG, safe attributes, and a curated
 * inline style subset while stripping scripts, event handlers, and unsafe URLs.
 */
export function sanitizePrototypeHtml(html: string): string {
  if (!html) {
    return '';
  }
  return sanitizeHtml(html, SANITIZE_PROTOTYPE_HTML_OPTIONS);
}

/**
 * Strips `expression(...)` calls safely, including nested parentheses.
 */
function stripCssExpressions(css: string): string {
  let result = css;
  let prev = '';
  while (result !== prev) {
    prev = result;
    result = result.replace(/expression\s*\([^()]*\)/gi, '');
  }
  // Remove any remaining unclosed `expression(` prefix.
  return result.replace(/expression\s*\(/gi, '');
}

/**
 * Sanitizes scoped prototype CSS. Strips `@import` rules, legacy `expression()`
 * calls, external `url(...)` beacons, and closing `</style` tags, and rewrites
 * viewport height (`vh`) units against `--proto-vh` so `100vh` resolves to the
 * simulated fold height instead of causing infinite iframe auto-height growth.
 */
export function sanitizePrototypeCss(css: string): string {
  if (!css) {
    return '';
  }
  // Strip CSS comments first so obfuscated directives cannot evade filtering.
  let out = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Strip `@import` rules (semicolon-terminated or line-terminated).
  out = out.replace(/@import\b[^;{}]*(?:;|\r?\n|$)/gi, '');
  // Strip `expression(...)` calls.
  out = stripCssExpressions(out);
  // Strip external `url(...)` beacons while keeping local SVG `#id` refs.
  out = out.replace(
    /url\s*\(\s*(['"]?)([\s\S]*?)\1\s*\)/gi,
    (_match, _quote: string, target: string) => {
      const trimmed = target.trim();
      if (/^#[a-zA-Z0-9_-]+$/.test(trimmed)) {
        return `url(${trimmed})`;
      }
      return 'none';
    }
  );
  // Strip remaining unsafe protocols and legacy IE/Firefox CSS bindings.
  out = out.replace(/(?:javascript|vbscript)\s*:/gi, '');
  out = out.replace(/(?:behavior|-moz-binding)\s*:[^;{}]*/gi, '');
  // Guard against breaking out of an inline `<style>` tag.
  out = out.replace(/<\/style/gi, '');
  // Rewrite `vh` units against the simulated fold custom property.
  out = rewriteViewportUnits(out);
  return out.trim();
}

/**
 * Generates `:root` and Tailwind v4 `@theme` CSS custom properties for a
 * prototype board's design tokens.
 */
export function buildThemeCss(theme: PrototypeTheme): string {
  const colorBg = sanitizePrototypeThemeValue(
    theme.colorBg,
    DEFAULT_THEME_TOKENS.colorBg
  );
  const colorSurface = sanitizePrototypeThemeValue(
    theme.colorSurface,
    DEFAULT_THEME_TOKENS.colorSurface
  );
  const colorFg = sanitizePrototypeThemeValue(
    theme.colorFg,
    DEFAULT_THEME_TOKENS.colorFg
  );
  const colorMuted = sanitizePrototypeThemeValue(
    theme.colorMuted,
    DEFAULT_THEME_TOKENS.colorMuted
  );
  const colorPrimary = sanitizePrototypeThemeValue(
    theme.colorPrimary,
    DEFAULT_THEME_TOKENS.colorPrimary
  );
  const colorOnPrimary = sanitizePrototypeThemeValue(
    theme.colorOnPrimary,
    DEFAULT_THEME_TOKENS.colorOnPrimary
  );
  const colorBorder = sanitizePrototypeThemeValue(
    theme.colorBorder,
    DEFAULT_THEME_TOKENS.colorBorder
  );
  const fontSans = sanitizePrototypeThemeValue(
    theme.fontSans,
    DEFAULT_THEME_TOKENS.fontSans
  );
  const fontHeading = sanitizePrototypeThemeValue(
    theme.fontHeading || theme.fontSans,
    fontSans
  );
  const fontMono = sanitizePrototypeThemeValue(
    theme.fontMono,
    DEFAULT_THEME_TOKENS.fontMono
  );
  const radiusBase = sanitizePrototypeThemeValue(
    theme.radius,
    DEFAULT_THEME_TOKENS.radius
  );
  const maxWContainer = sanitizePrototypeThemeValue(
    theme.containerMaxWidth,
    DEFAULT_THEME_TOKENS.containerMaxWidth
  );

  const tokenLines = [
    `  --color-bg: ${colorBg};`,
    `  --color-surface: ${colorSurface};`,
    `  --color-fg: ${colorFg};`,
    `  --color-muted: ${colorMuted};`,
    `  --color-primary: ${colorPrimary};`,
    `  --color-on-primary: ${colorOnPrimary};`,
    `  --color-border: ${colorBorder};`,
    `  --font-sans: ${fontSans};`,
    `  --font-heading: ${fontHeading};`,
    `  --font-mono: ${fontMono};`,
    `  --radius-base: ${radiusBase};`,
    `  --max-w-container: ${maxWContainer};`,
  ].join('\n');

  return [
    '@theme {',
    tokenLines,
    '}',
    '',
    ':root {',
    tokenLines,
    '}',
    '',
    'body {',
    '  margin: 0;',
    '  background-color: var(--color-bg);',
    '  color: var(--color-fg);',
    '  font-family: var(--font-sans);',
    '}',
  ].join('\n');
}

/** Finds the first schema field matching any id pattern or field type. */
function findMatchingField(
  fields: SiteSchemaSummary['fields'],
  idPattern: RegExp,
  types?: string[]
) {
  return fields.find(
    (field) =>
      idPattern.test(field.id) ||
      (field.label ? idPattern.test(field.label) : false) ||
      (types ? types.includes(field.type) : false)
  );
}

/**
 * Generates deterministic, clean Tailwind v4 wireframe HTML from a
 * `SiteSchemaSummary` so existing site components look crisp immediately
 * before Root AI synthesizes a custom Visual Twin.
 */
export function renderSchemaFallbackHtml(
  schemaSummary: SiteSchemaSummary
): string {
  const label = escapeHtml(schemaSummary.label || schemaSummary.name);
  const description = schemaSummary.description
    ? escapeHtml(schemaSummary.description)
    : '';
  const fields = schemaSummary.fields || [];

  const eyebrowField = findMatchingField(
    fields,
    /^(?:eyebrow|kicker|badge|overline|tag|category)$/i
  );
  const titleField = findMatchingField(
    fields,
    /^(?:title|heading|headline|heroTitle|sectionTitle)$/i
  );
  const bodyField = findMatchingField(
    fields,
    /^(?:body|description|subtitle|subhead|summary|copy|text|lead)$/i,
    ['richtext']
  );
  const imageField = findMatchingField(
    fields,
    /(?:image|media|photo|illustration|thumbnail|poster|graphic|video)/i,
    ['image']
  );
  const buttonsField = findMatchingField(
    fields,
    /(?:buttons?|ctas?|actions?|links?)/i
  );
  const nonButtonFields = fields.filter((field) => field !== buttonsField);
  const itemsField = findMatchingField(
    nonButtonFields,
    /(?:items|cards|features|columns|tiers|grid|list|logos|testimonials|steps|faqs)/i,
    ['array']
  );

  const isHero = /hero/i.test(schemaSummary.name) || /hero/i.test(label);
  const headingTag = isHero ? 'h1' : 'h2';
  const headingSize = isHero
    ? 'text-4xl md:text-5xl font-semibold tracking-tight'
    : 'text-2xl md:text-3xl font-semibold tracking-tight';

  const headingText = titleField?.label
    ? `${label}: ${escapeHtml(titleField.label)}`
    : label;
  const bodyText =
    description ||
    (bodyField?.help ? escapeHtml(bodyField.help) : '') ||
    `Wireframe preview for ${label} reflecting the existing site schema fields.`;

  const eyebrowHtml = eyebrowField
    ? `<p class="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">${escapeHtml(eyebrowField.label || eyebrowField.id)}</p>`
    : '';

  const buttonsHtml = buttonsField
    ? `<div class="mt-6 flex flex-wrap items-center gap-3">
        <a href="#" class="inline-flex items-center justify-center rounded-[var(--radius-base)] bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-[var(--color-on-primary)]">Primary action</a>
        <a href="#" class="inline-flex items-center justify-center rounded-[var(--radius-base)] border border-[var(--color-border)] bg-[var(--color-bg)] px-5 py-2.5 text-sm font-medium text-[var(--color-fg)]">Secondary action</a>
      </div>`
    : '';

  const imageHtml = imageField
    ? `<div class="flex aspect-[4/3] w-full flex-col items-center justify-center rounded-[var(--radius-base)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
        <svg class="h-10 w-10 text-[var(--color-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-5-5L5 21" />
        </svg>
        <span class="mt-2 text-xs font-medium text-[var(--color-muted)]">${escapeHtml(imageField.label || imageField.id)}</span>
      </div>`
    : '';

  const itemsGridHtml = itemsField
    ? `<div class="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
        ${[1, 2, 3]
          .map(
            (
              n
            ) => `<article class="flex flex-col rounded-[var(--radius-base)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <div class="mb-4 h-32 w-full rounded-[var(--radius-base)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg)]"></div>
          <h3 class="text-base font-semibold text-[var(--color-fg)]">${escapeHtml(itemsField.label || 'Item')} ${n}</h3>
          <p class="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">Supporting details and structured copy for card ${n}.</p>
        </article>`
          )
          .join('\n        ')}
      </div>`
    : '';

  const headerTextBlock = `<div class="space-y-4">
      ${eyebrowHtml}
      <${headingTag} class="${headingSize} text-[var(--color-fg)]" style="font-family: var(--font-heading)">${headingText}</${headingTag}>
      <p class="max-w-2xl text-base leading-relaxed text-[var(--color-muted)]">${bodyText}</p>
      ${buttonsHtml}
    </div>`;

  // Use a split two-column layout when an image is paired with text and no card grid.
  let innerHtml: string;
  if (imageField && !itemsField) {
    innerHtml = `<div class="grid grid-cols-1 items-center gap-10 md:grid-cols-2">
      ${headerTextBlock}
      ${imageHtml}
    </div>`;
  } else {
    const fieldChips =
      !eyebrowField &&
      !titleField &&
      !bodyField &&
      !imageField &&
      !buttonsField &&
      !itemsField &&
      fields.length > 0
        ? `<div class="mt-6 flex flex-wrap gap-2">${fields
            .slice(0, 8)
            .map(
              (f) =>
                `<span class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-muted)]">${escapeHtml(f.label || f.id)} (${escapeHtml(f.type)})</span>`
            )
            .join('')}</div>`
        : '';
    innerHtml = `${headerTextBlock}${imageHtml ? `<div class="mt-8">${imageHtml}</div>` : ''}${itemsGridHtml}${fieldChips}`;
  }

  return `<div class="w-full border-b border-[var(--color-border)] bg-[var(--color-bg)] py-16 px-6 md:px-10">
  <div class="mx-auto w-full" style="max-width: var(--max-w-container)">
    ${innerHtml}
  </div>
</div>`;
}

/** Options for `buildFrameSrcdoc()`. */
export interface BuildFrameSrcdocOptions {
  /** Origin of the CMS server (e.g. `https://cms.example.com`). */
  cmsOrigin: string;
  /** Full or origin-rooted URL to `/cms/static/prototype-runtime.js`. */
  runtimeUrl: string;
  /** Optional Google Fonts stylesheet URLs (`https://fonts.googleapis.com/...`). */
  fontUrls?: string[];
}

/** Sanitizes an origin string for safe interpolation inside a CSP directive. */
function sanitizeCspOrigin(origin: string): string {
  const trimmed = String(origin || '')
    .trim()
    .replace(/\/+$/, '');
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.origin;
    }
  } catch {
    // Fall through to empty origin when invalid.
  }
  return '';
}

/** Returns only valid Google Fonts stylesheet URLs permitted by the frame CSP. */
function filterAllowedFontUrls(fontUrls: string[] | undefined): string[] {
  if (!Array.isArray(fontUrls)) {
    return [];
  }
  const result: string[] = [];
  for (const raw of fontUrls) {
    if (typeof raw !== 'string') {
      continue;
    }
    try {
      const parsed = new URL(raw.trim());
      if (
        parsed.protocol === 'https:' &&
        parsed.hostname === 'fonts.googleapis.com'
      ) {
        result.push(parsed.toString());
      }
    } catch {
      // Ignore malformed URLs.
    }
  }
  return result;
}

/**
 * Builds the `srcdoc` HTML shell for a sandboxed (`sandbox="allow-scripts"`)
 * prototype artboard iframe, enforcing a strict Content-Security-Policy and
 * loading the standalone Tailwind v4 runtime script.
 */
export function buildFrameSrcdoc(options: BuildFrameSrcdocOptions): string {
  const safeOrigin = sanitizeCspOrigin(options.cmsOrigin);
  const scriptSrc = safeOrigin
    ? `${safeOrigin}/cms/static/prototype-runtime.js`
    : '/cms/static/prototype-runtime.js';
  const csp = [
    "default-src 'none'",
    `script-src ${scriptSrc}`,
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com data:',
    'img-src https: data: blob:',
    "connect-src 'none'",
    "form-action 'none'",
    "frame-src 'none'",
  ].join('; ');

  const fontLinks = filterAllowedFontUrls(options.fontUrls)
    .map(
      (href) =>
        `  <link rel="stylesheet" href="${escapeHtmlAttr(href)}" crossorigin="anonymous">`
    )
    .join('\n');

  const safeRuntimeUrl = escapeHtmlAttr(options.runtimeUrl);

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttr(csp)}">`,
    fontLinks,
    '  <style id="proto-theme"></style>',
    '  <style id="proto-tw"></style>',
    '  <style id="proto-blocks"></style>',
    '</head>',
    '<body>',
    '  <main id="proto-root"></main>',
    `  <script type="module" src="${safeRuntimeUrl}"></script>`,
    '</body>',
    '</html>',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Options for `buildStandalonePreviewDocument()`. */
export interface BuildStandalonePreviewOptions {
  /** Prototype board title shown in the browser tab title. */
  boardTitle: string;
  /** Frame data to render full-page. */
  frame: PrototypeFrame;
  /** Board theme tokens and optional Google Fonts URLs. */
  theme: PrototypeTheme;
  /** Origin of the CMS server (e.g. `https://cms.example.com`). */
  cmsOrigin: string;
}

/**
 * Builds a standalone full-page HTML document and matching `sandbox allow-scripts`
 * Content-Security-Policy header for opening a prototype frame in a new tab.
 */
export function buildStandalonePreviewDocument(
  options: BuildStandalonePreviewOptions
): {html: string; csp: string} {
  const safeOrigin = sanitizeCspOrigin(options.cmsOrigin);
  const runtimeUrl = safeOrigin
    ? `${safeOrigin}/cms/static/prototype-runtime.js`
    : '/cms/static/prototype-runtime.js';

  const metaCsp = [
    "default-src 'none'",
    `script-src ${runtimeUrl}`,
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com data:',
    'img-src https: data: blob:',
    "connect-src 'none'",
    "form-action 'none'",
    "frame-src 'none'",
  ].join('; ');
  const httpCsp = `sandbox allow-scripts; ${metaCsp}; frame-ancestors 'self'`;

  const ordered = getOrderedBlocks(options.frame.blocks);
  const htmlParts: string[] = [];
  const cssParts: string[] = [];
  for (const {key, block} of ordered) {
    htmlParts.push(
      `<section data-block-key="${escapeHtmlAttr(key)}" data-component="${escapeHtmlAttr(block.component)}">${sanitizePrototypeHtml(block.html)}</section>`
    );
    if (block.css) {
      const cleaned = sanitizePrototypeCss(block.css);
      if (cleaned) {
        cssParts.push(cleaned);
      }
    }
  }

  const renderedHtml =
    htmlParts.length > 0
      ? htmlParts.join('\n')
      : '<section class="flex min-h-screen items-center justify-center p-8 text-center text-sm text-[var(--color-muted)]">This prototype frame has no content yet.</section>';

  const themeCss = buildThemeCss(options.theme || {});
  const blockCss = cssParts.join('\n');
  const pageTitle = [options.frame.title, options.boardTitle]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' · ');

  const standalonePayload = JSON.stringify({
    frameId: options.frame.id,
    title: pageTitle || 'Prototype Preview',
    html: renderedHtml,
    themeCss,
    blockCss,
    standalone: true,
  }).replace(/</g, '\\u003c');

  const fontLinks = filterAllowedFontUrls(options.theme?.fontUrls)
    .map(
      (href) =>
        `  <link rel="stylesheet" href="${escapeHtmlAttr(href)}" crossorigin="anonymous">`
    )
    .join('\n');

  const frameWidth = Math.max(240, Math.round(options.frame.width || 1440));
  const viewportShellCss =
    frameWidth < 1024
      ? `html{margin:0;padding:0;background:#f1f5f9;}body{margin:0 auto;padding:0;min-height:100vh;max-width:${frameWidth}px;box-shadow:0 0 0 1px rgba(15,23,42,0.08),0 12px 32px rgba(15,23,42,0.08);}#proto-root{min-height:100vh;}`
      : 'html,body{margin:0;padding:0;min-height:100vh;}#proto-root{min-height:100vh;}';

  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    `  <title>${escapeHtml(pageTitle || 'Prototype Preview')}</title>`,
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttr(metaCsp)}">`,
    fontLinks,
    `  <style>${viewportShellCss}</style>`,
    '  <style id="proto-theme"></style>',
    '  <style id="proto-tw"></style>',
    '  <style id="proto-blocks"></style>',
    '</head>',
    '<body>',
    '  <main id="proto-root"></main>',
    `  <script id="proto-standalone-data" type="application/json">${standalonePayload}</script>`,
    `  <script type="module" src="${escapeHtmlAttr(runtimeUrl)}"></script>`,
    '</body>',
    '</html>',
  ]
    .filter(Boolean)
    .join('\n');

  return {html, csp: httpCsp};
}
