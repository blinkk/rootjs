import {describe, expect, it} from 'vitest';
import {
  Proposal,
  getProposalDocIds,
  getProposedNewDocIds,
  parseProposal,
  serializeProposal,
  toDocEditOperations,
} from './proposal.js';

/** A proposal exercising every change kind. */
const FULL_PROPOSAL = `
version: 1
id: 2026-08-20-hero-refresh
title: Refresh the homepage hero
project: my-project
generated: "2026-08-20T18:22:04Z"
author: claude-code
summary: |
  Marketing asked for a benefit-led headline.

changes:
  - kind: doc.edit
    docId: Pages/home
    note: Headline rewrite.
    ops:
      - op: set
        path: hero.title
        before: "Welcome to Acme"
        after: "Build faster with Acme"

      - op: set
        path: hero.body
        before: |-
          Acme is a platform.

          Get started in minutes.
        after: |-
          Acme is the fastest way to ship.

          Your first page is live in five minutes.

      - op: insert_item
        path: content.modules
        index: 2
        after:
          _type: CalloutModule
          title: "Ships in minutes"

      - op: remove_item
        path: content.modules
        index: 5
        before:
          _type: LegacyBanner

  - kind: doc.create
    docId: Pages/pricing
    after:
      meta:
        title: "Pricing"

  - kind: doc.duplicate
    fromDocId: Pages/home
    toDocId: Pages/home-v2

  - kind: release.create
    releaseId: q3-launch
    ops:
      - op: set
        path: description
        after: "Q3 marketing launch"
      - op: set
        path: docIds
        after:
          - Pages/home
          - Pages/pricing

  - kind: release.update
    releaseId: q3-launch
    ops:
      - op: insert_item
        path: docIds
        after: Pages/about

  - kind: translations
    translationsId: Pages/home
    entries:
      - source: "Welcome to Acme"
        locales:
          es:
            before: "Bienvenido a Acme"
            after: "Crea más rápido con Acme"
          fr:
            before: null
            after: "Créez plus vite avec Acme"
`;

function parseOk(yaml: string): Proposal {
  const res = parseProposal(yaml);
  if (!res.ok) {
    throw new Error(
      `expected parse to succeed, got: ${JSON.stringify(res.errors, null, 2)}`
    );
  }
  return res.proposal;
}

describe('parseProposal', () => {
  it('parses every change kind', () => {
    const proposal = parseOk(FULL_PROPOSAL);
    expect(proposal.version).toBe(1);
    expect(proposal.id).toBe('2026-08-20-hero-refresh');
    expect(proposal.changes.map((c) => c.kind)).toEqual([
      'doc.edit',
      'doc.create',
      'doc.duplicate',
      'release.create',
      'release.update',
      'translations',
    ]);
  });

  it('preserves multi-line prose from block scalars', () => {
    const proposal = parseOk(FULL_PROPOSAL);
    const change = proposal.changes[0];
    if (change.kind !== 'doc.edit') throw new Error('expected doc.edit');
    expect(change.ops[1].after).toBe(
      'Acme is the fastest way to ship.\n\nYour first page is live in five minutes.'
    );
    expect(change.ops[1].before).toBe(
      'Acme is a platform.\n\nGet started in minutes.'
    );
  });

  it('parses structured values natively', () => {
    const proposal = parseOk(FULL_PROPOSAL);
    const change = proposal.changes[0];
    if (change.kind !== 'doc.edit') throw new Error('expected doc.edit');
    expect(change.ops[2]).toMatchObject({
      op: 'insert_item',
      path: 'content.modules',
      index: 2,
      after: {_type: 'CalloutModule', title: 'Ships in minutes'},
    });
  });

  it('parses translations entries keyed by locale', () => {
    const proposal = parseOk(FULL_PROPOSAL);
    const change = proposal.changes[5];
    if (change.kind !== 'translations')
      throw new Error('expected translations');
    expect(change.translationsId).toBe('Pages/home');
    expect(change.entries[0].source).toBe('Welcome to Acme');
    expect(change.entries[0].locales.es.after).toBe('Crea más rápido con Acme');
    expect(change.entries[0].locales.fr.before).toBeNull();
  });

  it('rejects an unknown version', () => {
    const res = parseProposal('version: 2\nid: x\nchanges: []\n');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0].message).toMatch(/Unsupported proposal version: 2/);
  });

  it('rejects a malformed doc id', () => {
    const res = parseProposal(
      'version: 1\nid: x\nchanges:\n  - kind: doc.edit\n    docId: home\n    ops:\n      - op: set\n        path: a\n        after: "b"\n'
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => /Collection\/slug/.test(e.message))).toBe(
      true
    );
  });

  it('reports a line number for a structural error', () => {
    const res = parseProposal(
      [
        'version: 1',
        'id: x',
        'changes:',
        '  - kind: doc.edit',
        '    docId: Pages/home',
        '    ops:',
        '      - op: set',
        '        path: hero.title',
        '        after: "ok"',
        '      - op: bogus',
        '        path: hero.body',
        '        after: "ok"',
      ].join('\n')
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const err = res.errors.find((e) => e.path.includes('ops.1'));
    expect(err).toBeDefined();
    expect(err!.line).toBe(10);
  });

  it('reports a line number for a YAML syntax error', () => {
    const res = parseProposal('version: 1\nid: x\n  bad: indent\n');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0].line).toBeGreaterThan(0);
  });

  it('requires `after` on a set op', () => {
    const res = parseProposal(
      'version: 1\nid: x\nchanges:\n  - kind: doc.edit\n    docId: Pages/home\n    ops:\n      - op: set\n        path: a\n'
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => /`after` is required/.test(e.message))).toBe(
      true
    );
  });

  it('requires `index` on a remove_item op', () => {
    const res = parseProposal(
      'version: 1\nid: x\nchanges:\n  - kind: doc.edit\n    docId: Pages/home\n    ops:\n      - op: remove_item\n        path: a\n'
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => /`index` is required/.test(e.message))).toBe(
      true
    );
  });
});

describe('parseProposal YAML coercion guards', () => {
  // The `yaml` package resolves scalars with the YAML 1.2 core schema, so
  // these are the values that genuinely change type when left unquoted.
  const coerced: Array<[string, string]> = [
    ['true', 'the boolean true'],
    ['false', 'the boolean false'],
    ['1.10', 'the number 1.1'],
    ['0o17', 'the number 15'],
    ['1e3', 'the number 1000'],
    ['null', 'null'],
    ['~', 'null'],
  ];

  for (const [raw, described] of coerced) {
    it(`rejects an unquoted \`${raw}\` where a string is expected`, () => {
      const res = parseProposal(
        `version: 1\nid: x\nchanges:\n  - kind: translations\n    translationsId: t\n    entries:\n      - source: ${raw}\n        locales:\n          es:\n            after: "hola"\n`
      );
      expect(res.ok).toBe(false);
      if (res.ok) return;
      const err = res.errors.find((e) => e.path.includes('source'));
      expect(err, `expected an error for source: ${raw}`).toBeDefined();
      expect(err!.message).toContain('must be a string');
      expect(err!.message).toContain(described);
    });
  }

  // Under YAML 1.2 these stay strings, unlike YAML 1.1 where `No`/`on` would
  // resolve to booleans. Pinned here so a schema change would be caught.
  const notCoerced = ['No', 'yes', 'on', 'off', '2026-08-20', '12:30'];

  for (const raw of notCoerced) {
    it(`keeps an unquoted \`${raw}\` as a string`, () => {
      const proposal = parseOk(
        `version: 1\nid: x\nchanges:\n  - kind: translations\n    translationsId: t\n    entries:\n      - source: ${raw}\n        locales:\n          es:\n            after: "hola"\n`
      );
      const change = proposal.changes[0];
      if (change.kind !== 'translations') {
        throw new Error('expected translations');
      }
      expect(change.entries[0].source).toBe(raw);
    });
  }

  it('accepts coercion-prone values when quoted', () => {
    const proposal = parseOk(
      'version: 1\nid: x\nchanges:\n  - kind: translations\n    translationsId: t\n    entries:\n      - source: "true"\n        locales:\n          es:\n            after: "1.10"\n'
    );
    const change = proposal.changes[0];
    if (change.kind !== 'translations')
      throw new Error('expected translations');
    expect(change.entries[0].source).toBe('true');
    expect(change.entries[0].locales.es.after).toBe('1.10');
  });
});

describe('serializeProposal', () => {
  it('round-trips: parse -> serialize -> parse is a fixed point', () => {
    const first = parseOk(FULL_PROPOSAL);
    const yaml = serializeProposal(first);
    const second = parseOk(yaml);
    expect(second).toEqual(first);
    // Serializing again must be byte-identical.
    expect(serializeProposal(second)).toBe(yaml);
  });

  it('quotes strings that would otherwise be coerced', () => {
    const proposal: Proposal = {
      version: 1,
      id: 'x',
      changes: [
        {
          kind: 'doc.edit',
          docId: 'Pages/home',
          ops: [{op: 'set', path: 'hero.title', after: 'No'}],
        },
      ],
    };
    const yaml = serializeProposal(proposal);
    expect(yaml).toContain('"No"');
    const reparsed = parseOk(yaml);
    const change = reparsed.changes[0];
    if (change.kind !== 'doc.edit') throw new Error('expected doc.edit');
    expect(change.ops[0].after).toBe('No');
  });

  it('writes multi-line strings as block scalars', () => {
    const proposal: Proposal = {
      version: 1,
      id: 'x',
      changes: [
        {
          kind: 'doc.edit',
          docId: 'Pages/home',
          ops: [{op: 'set', path: 'hero.body', after: 'one\n\ntwo'}],
        },
      ],
    };
    const yaml = serializeProposal(proposal);
    expect(yaml).toMatch(/after: \|-/);
    expect(parseOk(yaml)).toEqual(proposal);
  });
});

describe('toDocEditOperations', () => {
  it('maps `after` to `value` and drops `before`', () => {
    expect(
      toDocEditOperations([
        {op: 'set', path: 'a.b', before: 'old', after: 'new'},
        {op: 'insert_item', path: 'a.list', index: 1, after: {x: 1}},
        {op: 'remove_item', path: 'a.list', index: 0, before: {x: 2}},
      ])
    ).toEqual([
      {op: 'set', path: 'a.b', value: 'new'},
      {op: 'insert_item', path: 'a.list', value: {x: 1}, index: 1},
      {op: 'remove_item', path: 'a.list', index: 0},
    ]);
  });
});

describe('doc id helpers', () => {
  it('lists proposed new doc ids', () => {
    expect(getProposedNewDocIds(parseOk(FULL_PROPOSAL))).toEqual([
      'Pages/pricing',
      'Pages/home-v2',
    ]);
  });

  it('lists every touched doc id, deduped', () => {
    expect(getProposalDocIds(parseOk(FULL_PROPOSAL))).toEqual([
      'Pages/home',
      'Pages/pricing',
      'Pages/home-v2',
    ]);
  });
});
