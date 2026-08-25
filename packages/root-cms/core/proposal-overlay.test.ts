import {describe, expect, it} from 'vitest';
import {parseProposal, type Proposal} from '../shared/proposal.js';
import {ProposalOverlay} from './client.js';

function proposalOf(yaml: string): Proposal {
  const res = parseProposal(yaml);
  if (!res.ok) {
    throw new Error(`bad fixture: ${JSON.stringify(res.errors)}`);
  }
  return res.proposal;
}

function docOf(id: string, fields: Record<string, any>): any {
  const slashIndex = id.indexOf('/');
  return {
    id,
    collection: id.slice(0, slashIndex),
    slug: id.slice(slashIndex + 1),
    sys: {createdAt: 1, createdBy: 'a', modifiedAt: 1, modifiedBy: 'a'},
    fields,
  };
}

describe('ProposalOverlay.applyToDoc', () => {
  it('applies edit ops to the matching doc', () => {
    const overlay = new ProposalOverlay(
      proposalOf(
        'version: 1\nid: p\nchanges:\n  - kind: doc.edit\n    docId: Pages/home\n    ops:\n      - op: set\n        path: hero.title\n        after: "Proposed"\n'
      )
    );
    const doc = docOf('Pages/home', {hero: {title: 'Live'}});
    const out = overlay.applyToDoc(doc);
    expect(out.fields.hero.title).toBe('Proposed');
    // The input doc must not be mutated.
    expect(doc.fields.hero.title).toBe('Live');
  });

  it('leaves unrelated docs untouched', () => {
    const overlay = new ProposalOverlay(
      proposalOf(
        'version: 1\nid: p\nchanges:\n  - kind: doc.edit\n    docId: Pages/home\n    ops:\n      - op: set\n        path: hero.title\n        after: "Proposed"\n'
      )
    );
    const doc = docOf('Pages/about', {hero: {title: 'Live'}});
    expect(overlay.applyToDoc(doc)).toBe(doc);
  });

  it('merges ops from two changes targeting the same doc', () => {
    const overlay = new ProposalOverlay(
      proposalOf(
        [
          'version: 1',
          'id: p',
          'changes:',
          '  - kind: doc.edit',
          '    docId: Pages/home',
          '    ops:',
          '      - op: set',
          '        path: a',
          '        after: "1"',
          '  - kind: doc.edit',
          '    docId: Pages/home',
          '    ops:',
          '      - op: set',
          '        path: b',
          '        after: "2"',
        ].join('\n')
      )
    );
    const out = overlay.applyToDoc(docOf('Pages/home', {}));
    expect(out.fields).toEqual({a: '1', b: '2'});
  });

  it('returns the doc unchanged when an op cannot be applied', () => {
    const overlay = new ProposalOverlay(
      proposalOf(
        'version: 1\nid: p\nchanges:\n  - kind: doc.edit\n    docId: Pages/home\n    ops:\n      - op: remove_item\n        path: missing.list\n        index: 3\n'
      )
    );
    const doc = docOf('Pages/home', {hero: {title: 'Live'}});
    const out = overlay.applyToDoc(doc);
    expect(out.fields.hero.title).toBe('Live');
  });
});

describe('ProposalOverlay new docs', () => {
  const overlay = new ProposalOverlay(
    proposalOf(
      [
        'version: 1',
        'id: p',
        'changes:',
        '  - kind: doc.create',
        '    docId: Pages/pricing',
        '    after:',
        '      hero:',
        '        title: "Pricing"',
        '  - kind: doc.duplicate',
        '    fromDocId: Pages/home',
        '    toDocId: Pages/home-v2',
        '  - kind: doc.create',
        '    docId: Posts/hello',
        '    after:',
        '      title: "Hello"',
      ].join('\n')
    )
  );

  it('counts new docs per collection', () => {
    expect(overlay.countNewDocsInCollection('Pages')).toBe(2);
    expect(overlay.countNewDocsInCollection('Posts')).toBe(1);
    expect(overlay.countNewDocsInCollection('Other')).toBe(0);
    expect(overlay.hasNewDocsInCollection('Pages')).toBe(true);
    expect(overlay.hasNewDocsInCollection('Other')).toBe(false);
  });

  it('builds a synthetic doc for a created doc id', () => {
    const doc = overlay.buildNewDoc('Pages/pricing');
    expect(doc).toMatchObject({
      id: 'Pages/pricing',
      collection: 'Pages',
      slug: 'pricing',
      fields: {hero: {title: 'Pricing'}},
    });
  });

  it('returns null for a doc id the proposal does not create', () => {
    expect(overlay.buildNewDoc('Pages/home')).toBeNull();
  });

  it('skips docs that already exist in the db', () => {
    const docs = overlay.newDocsInCollection(
      'Pages',
      new Set(['Pages/pricing'])
    );
    expect(docs.map((d) => d.id)).toEqual(['Pages/home-v2']);
  });
});

describe('ProposalOverlay translations', () => {
  const overlay = new ProposalOverlay(
    proposalOf(
      [
        'version: 1',
        'id: p',
        'changes:',
        '  - kind: translations',
        '    translationsId: Pages/home',
        '    entries:',
        '      - source: "Hello"',
        '        locales:',
        '          es:',
        '            after: "Hola"',
        '          fr:',
        '            after: "Bonjour"',
      ].join('\n')
    )
  );

  it('flattens all translations by source', () => {
    expect(overlay.allTranslations()).toEqual({
      Hello: {es: 'Hola', fr: 'Bonjour'},
    });
  });

  it('shapes locale doc strings as a hash map', () => {
    const strings = overlay.localeDocStrings('Pages/home', 'es');
    expect(strings).toBeTruthy();
    const entries = Object.values(strings!);
    expect(entries).toEqual([{source: 'Hello', translation: 'Hola'}]);
  });

  it('returns null for a locale with no proposed strings', () => {
    expect(overlay.localeDocStrings('Pages/home', 'de')).toBeNull();
    expect(overlay.localeDocStrings('Pages/other', 'es')).toBeNull();
  });

  it('has no translations when the proposal contains none', () => {
    const empty = new ProposalOverlay(
      proposalOf(
        'version: 1\nid: p\nchanges:\n  - kind: doc.edit\n    docId: Pages/home\n    ops:\n      - op: set\n        path: a\n        after: "1"\n'
      )
    );
    expect(empty.allTranslations()).toBeNull();
  });
});

describe('ProposalOverlay ignores release changes', () => {
  it('does not treat a release change as a doc or translation', () => {
    const overlay = new ProposalOverlay(
      proposalOf(
        'version: 1\nid: p\nchanges:\n  - kind: release.create\n    releaseId: q3\n    ops:\n      - op: set\n        path: description\n        after: "Q3"\n'
      )
    );
    expect(overlay.newDocIds()).toEqual([]);
    expect(overlay.allTranslations()).toBeNull();
    const doc = docOf('Pages/home', {a: '1'});
    expect(overlay.applyToDoc(doc)).toBe(doc);
  });
});
