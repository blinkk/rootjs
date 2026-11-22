import {describe, expect, it} from 'vitest';
import {
  buildFrameSrcdoc,
  buildStandalonePreviewDocument,
  buildThemeCss,
  renderSchemaFallbackHtml,
  sanitizePrototypeCss,
  sanitizePrototypeHtml,
} from './prototype-render.js';
import type {SiteSchemaSummary} from './prototypes.js';

describe('sanitizePrototypeHtml', () => {
  it('strips scripts, event handlers, and javascript: URLs', () => {
    const dirty = [
      '<section class="p-8" onclick="alert(1)" onmouseover="evil()">',
      '  <script>window.pwned = true;</script>',
      '  <iframe src="https://evil.example"></iframe>',
      '  <a href="javascript:alert(1)" target="_blank">Bad link</a>',
      '  <a href="https://rootjs.dev" target="_blank">Good link</a>',
      '  <img src="javascript:alert(2)" onerror="alert(3)" alt="bad" />',
      '  <img src="https://example.com/a.png" alt="good" width="400" height="300" />',
      '</section>',
    ].join('\n');

    const clean = sanitizePrototypeHtml(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('pwned');
    expect(clean).not.toContain('<iframe');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('onmouseover');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('href="https://rootjs.dev"');
    expect(clean).toContain('rel="noopener noreferrer"');
    expect(clean).toContain('src="https://example.com/a.png"');
  });

  it('preserves semantic layout tags, SVG attributes, data/aria attributes, and safe inline styles', () => {
    const input = [
      '<section data-block-key="b1" data-component="Hero" aria-label="Hero section" role="region" style="color: #111; --accent: #0f172a; padding-top: 16px; background-image: url(https://evil.test/track.gif); position: fixed;">',
      '  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
      '    <path d="M4 12h16" stroke-linecap="round" stroke-linejoin="round"></path>',
      '  </svg>',
      '</section>',
    ].join('\n');

    const clean = sanitizePrototypeHtml(input);
    expect(clean).toContain('data-block-key="b1"');
    expect(clean).toContain('data-component="Hero"');
    expect(clean).toContain('aria-label="Hero section"');
    expect(clean).toContain('role="region"');
    expect(clean).toContain('viewBox="0 0 24 24"');
    expect(clean).toContain('stroke-width="2"');
    expect(clean).toContain('color: #111');
    expect(clean).toContain('--accent: #0f172a');
    expect(clean).toContain('padding-top: 16px');
    expect(clean).not.toContain('evil.test');
    expect(clean).not.toContain('position: fixed');
  });
});

describe('sanitizePrototypeCss', () => {
  it('strips @import, expression(), and external url() beacons', () => {
    const dirty = [
      '@import url("https://evil.example/a.css");',
      '@im/*obfuscated*/port "https://evil.example/b.css";',
      '.hero {',
      '  background-image: url("https://evil.example/beacon.gif");',
      '  width: expression(alert(1));',
      '  clip-path: url(#heroClip);',
      '  color: #111;',
      '}',
    ].join('\n');

    const clean = sanitizePrototypeCss(dirty);
    expect(clean).not.toContain('@import');
    expect(clean).not.toContain('evil.example');
    expect(clean).not.toContain('expression');
    expect(clean).toContain('url(#heroClip)');
    expect(clean).toContain('color: #111');
  });

  it('rewrites vh units to calc against --proto-vh', () => {
    const css = [
      '.hero { min-height: 100vh; padding-top: 12.5vh; }',
      '.keep { --custom-vh: 20px; width: 100%; }',
    ].join('\n');

    const clean = sanitizePrototypeCss(css);
    expect(clean).toContain('min-height: calc(100 * var(--proto-vh, 9px))');
    expect(clean).toContain('padding-top: calc(12.5 * var(--proto-vh, 9px))');
    expect(clean).toContain('--custom-vh: 20px');
  });
});

describe('buildThemeCss', () => {
  it('generates :root and @theme custom properties and sanitizes unsafe values', () => {
    const css = buildThemeCss({
      colorPrimary: '#2563eb',
      colorBg: '#ffffff; } body { display: none; }',
      fontHeading: '"Plus Jakarta Sans", sans-serif',
      radius: '12px',
    });

    expect(css).toContain('@theme {');
    expect(css).toContain(':root {');
    expect(css).toContain('--color-primary: #2563eb;');
    expect(css).toContain('--font-heading: "Plus Jakarta Sans", sans-serif;');
    expect(css).toContain('--radius-base: 12px;');
    expect(css).not.toContain('display: none');
  });
});

describe('renderSchemaFallbackHtml', () => {
  it('renders a split hero wireframe when title, body, buttons, and image are present', () => {
    const heroSchema: SiteSchemaSummary = {
      name: 'TemplateHero',
      label: 'Hero',
      description: 'Top-of-page hero section with CTA buttons.',
      fields: [
        {id: 'eyebrow', label: 'Eyebrow', type: 'string'},
        {id: 'title', label: 'Headline', type: 'string'},
        {id: 'body', label: 'Body copy', type: 'richtext'},
        {id: 'buttons', label: 'CTAs', type: 'array'},
        {id: 'image', label: 'Hero Image', type: 'image'},
      ],
    };

    const html = renderSchemaFallbackHtml(heroSchema);
    expect(html).toContain('<h1');
    expect(html).toContain('Eyebrow');
    expect(html).toContain('Hero: Headline');
    expect(html).toContain('Primary action');
    expect(html).toContain('Hero Image');
    expect(html).toContain('md:grid-cols-2');
  });

  it('renders a 3-column grid when an items/cards field is present', () => {
    const cardsSchema: SiteSchemaSummary = {
      name: 'FeatureCards',
      label: 'Feature Cards',
      fields: [
        {id: 'heading', label: 'Heading', type: 'string'},
        {id: 'cards', label: 'Feature', type: 'array'},
      ],
    };

    const html = renderSchemaFallbackHtml(cardsSchema);
    expect(html).toContain('<h2');
    expect(html).toContain('md:grid-cols-3');
    expect(html).toContain('Feature 1');
    expect(html).toContain('Feature 2');
    expect(html).toContain('Feature 3');
  });
});

describe('buildFrameSrcdoc', () => {
  it('includes a strict CSP, #proto-root mount, runtime script, and safe Google Fonts only', () => {
    const doc = buildFrameSrcdoc({
      cmsOrigin: 'https://cms.example.com',
      runtimeUrl: 'https://cms.example.com/cms/static/prototype-runtime.js',
      fontUrls: [
        'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap',
        'https://evil.example/font.css',
      ],
    });

    expect(doc).toContain(
      'script-src https://cms.example.com/cms/static/prototype-runtime.js'
    );
    expect(doc).toContain("connect-src 'none'");
    expect(doc).toContain('<main id="proto-root"></main>');
    expect(doc).toContain(
      '<script type="module" src="https://cms.example.com/cms/static/prototype-runtime.js"></script>'
    );
    expect(doc).toContain('https://fonts.googleapis.com/css2');
    expect(doc).not.toContain('evil.example');
  });
});

describe('buildStandalonePreviewDocument', () => {
  it('builds a full-page sandboxed preview HTML document with escaped JSON payload', () => {
    const {html, csp} = buildStandalonePreviewDocument({
      boardTitle: 'Home Page Copy Refresh',
      cmsOrigin: 'https://cms.example.com',
      theme: {colorPrimary: '#15803d'},
      frame: {
        id: 'variant-a',
        boardId: 'home-copy',
        pageId: 'page-1',
        title: 'Variant A',
        width: 1440,
        x: 80,
        y: 80,
        blocks: {
          _array: ['hero'],
          hero: {
            component: 'Hero',
            label: 'Hero',
            html: '<section class="py-20"><script>bad()</script><h1>Build. Edit. Ship.</h1></section>',
          },
        },
        createdAt: 1,
        createdBy: 'dev@example.com',
        updatedAt: 1,
        updatedBy: 'dev@example.com',
      },
    });

    expect(csp).toContain('sandbox allow-scripts;');
    expect(csp).toContain(
      'script-src https://cms.example.com/cms/static/prototype-runtime.js'
    );
    expect(html).toContain('<title>Variant A · Home Page Copy Refresh</title>');
    expect(html).toContain('id="proto-standalone-data"');
    expect(html).toContain('Build. Edit. Ship.');
    expect(html).not.toContain('bad()');
    expect(html).not.toContain('</script><script>');
  });
});
