import {describe, expect, it} from 'vitest';
import {
  diffLines,
  parseProposalMarkdown,
  serializeProposalMarkdown,
} from './proposal-markdown.js';
import type {Proposal} from './proposal.js';

/** A proposal exercising every change kind. */
const FULL_PROPOSAL: Proposal = {
  version: 1,
  id: '2026-08-20-hero-refresh',
  title: 'Refresh the homepage hero',
  project: 'my-project',
  generated: '2026-08-20T18:22:04Z',
  author: 'claude-code',
  summary: 'Marketing asked for a benefit-led headline.\n\n- One\n- Two',
  changes: [
    {
      kind: 'doc.edit',
      docId: 'Pages/home',
      note: 'Headline rewrite.',
      ops: [
        {
          op: 'set',
          path: 'hero.title',
          before: 'Welcome to Acme',
          after: 'Build faster with Acme',
        },
        {
          op: 'set',
          path: 'hero.body',
          before: 'Acme is a platform.\n\nGet started in minutes.\n',
          after:
            'Acme is the fastest way to ship.\n\nGet started in minutes.\n',
        },
        {op: 'set', path: 'hero.subtitle', before: null, after: 'true'},
        {
          op: 'set',
          path: 'hero.cta',
          before: {label: 'Go', url: '/a'},
          after: {label: 'Go', url: '/b', enabled: true},
        },
        {
          op: 'insert_item',
          path: 'content.modules',
          index: 2,
          after: {_type: 'CalloutModule', title: 'Ships in minutes'},
        },
        {op: 'insert_item', path: 'content.modules', after: {_type: 'Footer'}},
        {
          op: 'remove_item',
          path: 'content.modules',
          index: 5,
          before: {_type: 'LegacyBanner'},
        },
        {op: 'remove_item', path: 'content.modules', index: 0},
      ],
    },
    {
      kind: 'doc.create',
      docId: 'Pages/pricing',
      after: {meta: {title: 'Pricing'}},
    },
    {kind: 'doc.duplicate', fromDocId: 'Pages/home', toDocId: 'Pages/home-v2'},
    {
      kind: 'release.create',
      releaseId: 'q3-launch',
      ops: [
        {op: 'set', path: 'description', after: 'Q3 marketing launch'},
        {op: 'set', path: 'docIds', after: ['Pages/home', 'Pages/pricing']},
      ],
    },
    {
      kind: 'translations',
      translationsId: 'Pages/home',
      note: 'Spanish and French copy.',
      entries: [
        {
          source: 'Welcome to Acme',
          locales: {
            es: {before: 'Bienvenido a Acme', after: 'Crea más rápido'},
            fr: {before: null, after: 'Créez plus vite'},
            de: {after: 'Schneller bauen'},
          },
        },
      ],
    },
  ],
};

function parseOk(markdown: string): Proposal {
  const res = parseProposalMarkdown(markdown);
  if (!res.ok) {
    throw new Error(
      `expected parse to succeed, got: ${JSON.stringify(res.errors, null, 2)}`
    );
  }
  return res.proposal;
}

describe('serializeProposalMarkdown', () => {
  it('round-trips every change kind, byte-stable', () => {
    const markdown = serializeProposalMarkdown(FULL_PROPOSAL);
    const parsed = parseOk(markdown);
    expect(parsed).toEqual(FULL_PROPOSAL);
    expect(serializeProposalMarkdown(parsed)).toBe(markdown);
  });

  it('writes a set as a single diff block', () => {
    const markdown = serializeProposalMarkdown(FULL_PROPOSAL);
    expect(markdown).toContain(
      [
        '### Set `hero.body`',
        '',
        '```diff text',
        '-Acme is a platform.',
        '+Acme is the fastest way to ship.',
        '',
        ' Get started in minutes.',
        '',
        '```',
      ].join('\n')
    );
  });

  it('uses a longer fence for values that contain code fences', () => {
    const code = 'Example:\n\n```ts\nconst a = 1;\n```';
    const proposal: Proposal = {
      version: 1,
      id: 'x',
      changes: [
        {
          kind: 'doc.edit',
          docId: 'Pages/home',
          ops: [{op: 'set', path: 'body', before: '', after: code}],
        },
      ],
    };
    const markdown = serializeProposalMarkdown(proposal);
    expect(markdown).toContain('````diff text');
    expect(parseOk(markdown)).toEqual(proposal);
  });
});

describe('parseProposalMarkdown', () => {
  it('parses a hand-written proposal', () => {
    const proposal = parseOk(
      [
        '# Hero refresh',
        '',
        '- **id:** `hero`',
        '- version: 1',
        '',
        '## Edit `Pages/home`',
        '',
        '### Set `hero.title`',
        '',
        '```diff text',
        '-Old',
        '+New',
        '```',
        '',
        '### Set `hero.links`',
        '',
        '```json',
        '["/a", "/b"]',
        '```',
      ].join('\r\n')
    );
    expect(proposal).toEqual({
      version: 1,
      id: 'hero',
      title: 'Hero refresh',
      changes: [
        {
          kind: 'doc.edit',
          docId: 'Pages/home',
          ops: [
            {op: 'set', path: 'hero.title', before: 'Old', after: 'New'},
            {op: 'set', path: 'hero.links', after: ['/a', '/b']},
          ],
        },
      ],
    });
  });

  it('reports structural errors with line numbers', () => {
    const res = parseProposalMarkdown(
      [
        '- **id:** `x`',
        '- **version:** 1',
        '',
        '## Edit `Pages/home`',
        '',
        '### Replace `hero.title`',
        '',
        '### Set `hero.body`',
        '',
        '```diff text',
        '-Old',
        '*New',
        '```',
        '',
        '## Publish `Pages/home`',
      ].join('\n')
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.map((err) => err.line)).toEqual([6, 12, 15]);
    expect(res.errors[0].message).toMatch(/Unknown op/);
    expect(res.errors[1].message).toMatch(/must start with/);
    expect(res.errors[2].message).toMatch(/Unknown section/);
  });

  it('maps schema errors to the source line', () => {
    const res = parseProposalMarkdown(
      [
        '- **id:** `x`',
        '- **version:** 1',
        '',
        '## Edit `home`',
        '',
        '### Set `hero.title`',
        '',
        '```text',
        'New',
        '```',
      ].join('\n')
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors).toEqual([
      expect.objectContaining({line: 4, path: 'changes.0.docId'}),
    ]);
  });
});

describe('diffLines', () => {
  it('returns a minimal line diff', () => {
    expect(diffLines(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd', 'e'])).toEqual([
      [' ', 'a'],
      ['-', 'b'],
      ['+', 'x'],
      [' ', 'c'],
      [' ', 'd'],
      ['+', 'e'],
    ]);
  });
});
