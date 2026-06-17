/**
 * Head-to-head SSR render benchmark: Root's built-in JSX renderer
 * (`renderJsxToString`) vs `preact-render-to-string`, across several
 * representative page shapes.
 *
 * Imports the renderer from source (`../src/...`), so it reflects local edits
 * to the renderer immediately (no rebuild needed).
 *
 * To run this benchmark:
 *
 * ```
 * pnpm vitest bench test/jsx-render.bench.ts
 * ```
 *
 * Reading the results:
 * - Each shape has its own `describe` group; compare the `preact`, Root
 *   `minimal`, and Root `pretty` rows within a group.
 * - `minimal` is the apples-to-apples comparison against `preact` (both emit
 *   compact HTML). `pretty` additionally formats with newlines.
 *
 * Shapes:
 * - card-grid:  attribute-heavy, wide tree (~520 nodes) — stresses renderAttrs.
 * - deep-nest:  deeply nested single-child chain — stresses recursion/dispatch.
 * - text-heavy: long prose with inline elements — stresses escapeHtml.
 */
import {h as preactH} from 'preact';
import {render as preactRender} from 'preact-render-to-string';
import {afterAll, bench, describe} from 'vitest';
import {renderJsxToString} from '../src/jsx/jsx-render.js';
import {h as rootH} from '../src/jsx/jsx-runtime.js';

type H = (type: any, props: any, ...children: any[]) => any;

/** Attribute-heavy card grid (~520 nodes). */
function cardGrid(h: H, cards = 24, navLinks = 8, tagsPerCard = 4) {
  const nav = h(
    'nav',
    {class: 'global-nav', 'aria-label': 'Primary'},
    h(
      'ul',
      {class: 'global-nav__list'},
      ...Array.from({length: navLinks}, (_, i) =>
        h(
          'li',
          {class: 'global-nav__item'},
          h(
            'a',
            {
              href: `/section-${i}/`,
              class: 'global-nav__link',
              'data-index': i,
            },
            `Section ${i}`
          )
        )
      )
    )
  );
  const cardEls = Array.from({length: cards}, (_, i) =>
    h(
      'article',
      {class: 'card', id: `card-${i}`, 'data-id': i, role: 'listitem'},
      h('img', {
        class: 'card__image',
        src: `https://cdn.example.com/img/${i}.jpg`,
        alt: `Card ${i} cover image`,
        loading: 'lazy',
        width: 640,
        height: 360,
      }),
      h('h3', {class: 'card__title'}, `Portfolio company ${i}`),
      h(
        'p',
        {class: 'card__body'},
        'We partner with founders building the next generation of ',
        h('strong', null, 'AI-first'),
        ' companies across every sector of the economy.'
      ),
      h(
        'ul',
        {class: 'card__tags'},
        ...Array.from({length: tagsPerCard}, (_, t) =>
          h('li', {class: 'card__tag', 'data-tag': `tag-${t}`}, `Tag ${t}`)
        )
      ),
      h(
        'a',
        {
          href: `/company/${i}/`,
          class: 'card__cta',
          'aria-label': `Read more about company ${i}`,
        },
        'Read more'
      )
    )
  );
  return h(
    'main',
    {class: 'page', lang: 'en'},
    h(
      'header',
      {class: 'global-header'},
      h('a', {href: '/', class: 'global-header__logo'}, 'Gradient'),
      nav
    ),
    h('section', {class: 'card-grid', role: 'list'}, ...cardEls)
  );
}

/** Deeply nested single-child chain (depth 40). */
function deepNest(h: H, depth = 40) {
  let node = h('span', {class: 'leaf'}, 'deep content here');
  for (let i = 0; i < depth; i++) {
    node = h('div', {class: `level-${i}`, 'data-depth': i}, node);
  }
  return h('main', null, node);
}

/** Long prose with inline elements (60 paragraphs). */
function textHeavy(h: H, paras = 60) {
  return h(
    'article',
    {class: 'prose'},
    ...Array.from({length: paras}, (_, i) =>
      h(
        'p',
        {class: 'para'},
        `Paragraph ${i}: `,
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ',
        h('em', null, 'Ut enim'),
        ' ad minim veniam, quis nostrud exercitation.'
      )
    )
  );
}

const SHAPES: Array<[string, (h: H) => any]> = [
  ['card-grid (~520 nodes, attr-heavy)', cardGrid],
  ['deep-nest (depth 40)', deepNest],
  ['text-heavy (60 paras)', textHeavy],
];

let sink = 0;

for (const [name, build] of SHAPES) {
  const preactTree = build(preactH);
  const rootTree = build(rootH);

  describe(name, () => {
    bench('preact-render-to-string', () => {
      sink ^= preactRender(preactTree).length;
    });

    bench('root renderJsxToString (minimal)', () => {
      sink ^= renderJsxToString(rootTree, {mode: 'minimal'}).length;
    });

    bench('root renderJsxToString (pretty)', () => {
      sink ^= renderJsxToString(rootTree, {mode: 'pretty'}).length;
    });
  });
}

afterAll(() => {
  // Read `sink` so the benchmarked work above isn't optimized away.
  if (sink === Number.MIN_SAFE_INTEGER) {
    console.log(sink);
  }
});
