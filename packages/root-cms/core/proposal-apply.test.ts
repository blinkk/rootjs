import {describe, expect, it} from 'vitest';
import {parseProposal, type Proposal} from '../shared/proposal.js';
import {marshalData, type RootCMSClient} from './client.js';
import {applyProposal} from './proposal-apply.js';
import type {Schema} from './schema.js';

const PAGES_SCHEMA: Schema = {
  name: 'Pages',
  fields: [
    {id: 'hero', type: 'object', fields: [{id: 'title', type: 'string'}]},
    {
      id: 'content',
      type: 'object',
      fields: [
        {
          id: 'modules',
          type: 'array',
          of: {
            type: 'object',
            fields: [{id: 'title', type: 'string'}],
          },
        },
      ],
    },
  ],
} as unknown as Schema;

interface StubState {
  docs: Record<string, any>;
  releases: Record<string, any>;
  translations: Record<string, any>;
}

/**
 * A minimal stand-in for `RootCMSClient` covering only what `applyProposal`
 * touches, so the engine can be tested without the Firestore emulator.
 */
function createStubClient(initial?: Partial<StubState>) {
  const state: StubState = {
    docs: initial?.docs ?? {},
    releases: initial?.releases ?? {},
    translations: initial?.translations ?? {},
  };
  const saved: string[] = [];
  const client = {
    state,
    saved,
    async getRawDoc(collection: string, slug: string) {
      const fields = state.docs[`${collection}/${slug}`];
      return fields ? {fields: marshalData(fields)} : null;
    },
    async getCollection(collectionId: string) {
      return collectionId === 'Pages' ? PAGES_SCHEMA : null;
    },
    async saveDraftData(docId: string, fields: any) {
      state.docs[docId] = fields;
      saved.push(docId);
    },
    async getRelease(releaseId: string) {
      return state.releases[releaseId] ?? null;
    },
    async setRelease(releaseId: string, release: any) {
      state.releases[releaseId] = {
        ...(state.releases[releaseId] || {}),
        ...release,
      };
      saved.push(`release:${releaseId}`);
    },
    getTranslationsManager() {
      return {
        async saveTranslations(id: string, strings: any) {
          state.translations[id] = strings;
          saved.push(`translations:${id}`);
        },
      };
    },
  };
  return client as unknown as RootCMSClient & typeof client;
}

function proposalOf(yaml: string): Proposal {
  const res = parseProposal(yaml);
  if (!res.ok) {
    throw new Error(`bad fixture: ${JSON.stringify(res.errors)}`);
  }
  return res.proposal;
}

describe('applyProposal doc changes', () => {
  it('applies a set op to an existing draft', async () => {
    const client = createStubClient({
      docs: {'Pages/home': {hero: {title: 'Old'}}},
    });
    const res = await applyProposal(
      client,
      proposalOf(
        'version: 1\nid: p\nchanges:\n  - kind: doc.edit\n    docId: Pages/home\n    ops:\n      - op: set\n        path: hero.title\n        before: "Old"\n        after: "New"\n'
      )
    );
    expect(res.ok).toBe(true);
    expect(client.state.docs['Pages/home'].hero.title).toBe('New');
  });

  it('composes two changes that target the same doc', async () => {
    const client = createStubClient({
      docs: {'Pages/home': {hero: {title: 'Old'}}},
    });
    const res = await applyProposal(
      client,
      proposalOf(
        [
          'version: 1',
          'id: p',
          'changes:',
          '  - kind: doc.edit',
          '    docId: Pages/home',
          '    ops:',
          '      - op: set',
          '        path: hero.title',
          '        after: "First"',
          '  - kind: doc.edit',
          '    docId: Pages/home',
          '    ops:',
          '      - op: set',
          '        path: hero.subtitle',
          '        after: "Second"',
        ].join('\n')
      )
    );
    expect(res.ok).toBe(true);
    // Both edits survive, and the doc is written exactly once.
    expect(client.state.docs['Pages/home']).toEqual({
      hero: {title: 'First', subtitle: 'Second'},
    });
    expect(client.saved.filter((s) => s === 'Pages/home')).toHaveLength(1);
  });

  it('rejects the whole proposal when one op fails, writing nothing', async () => {
    const client = createStubClient({
      docs: {'Pages/home': {hero: {title: 'Old'}}},
    });
    const res = await applyProposal(
      client,
      proposalOf(
        [
          'version: 1',
          'id: p',
          'changes:',
          '  - kind: doc.edit',
          '    docId: Pages/home',
          '    ops:',
          '      - op: set',
          '        path: hero.title',
          '        after: "New"',
          '  - kind: doc.edit',
          '    docId: Pages/missing',
          '    ops:',
          '      - op: set',
          '        path: hero.title',
          '        after: "Nope"',
        ].join('\n')
      )
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0].message).toMatch(/does not exist/);
    // The first change must not have been committed.
    expect(client.state.docs['Pages/home'].hero.title).toBe('Old');
    expect(client.saved).toHaveLength(0);
  });

  it('applies array insert and remove ops in order', async () => {
    const client = createStubClient({
      docs: {
        'Pages/home': {
          content: {modules: [{title: 'a'}, {title: 'b'}, {title: 'c'}]},
        },
      },
    });
    const res = await applyProposal(
      client,
      proposalOf(
        [
          'version: 1',
          'id: p',
          'changes:',
          '  - kind: doc.edit',
          '    docId: Pages/home',
          '    ops:',
          '      - op: insert_item',
          '        path: content.modules',
          '        index: 1',
          '        after:',
          '          title: "inserted"',
          '      - op: remove_item',
          '        path: content.modules',
          '        index: 3',
        ].join('\n')
      )
    );
    expect(res.ok).toBe(true);
    expect(
      client.state.docs['Pages/home'].content.modules.map((m: any) => m.title)
    ).toEqual(['a', 'inserted', 'b']);
  });

  it('creates a new doc and refuses to overwrite an existing one', async () => {
    const client = createStubClient();
    const yaml =
      'version: 1\nid: p\nchanges:\n  - kind: doc.create\n    docId: Pages/new\n    after:\n      hero:\n        title: "Hi"\n';
    expect((await applyProposal(client, proposalOf(yaml))).ok).toBe(true);
    expect(client.state.docs['Pages/new'].hero.title).toBe('Hi');

    const second = await applyProposal(client, proposalOf(yaml));
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.errors[0].message).toMatch(/already exists/);
  });

  it('duplicates a doc', async () => {
    const client = createStubClient({
      docs: {'Pages/home': {hero: {title: 'Original'}}},
    });
    const res = await applyProposal(
      client,
      proposalOf(
        'version: 1\nid: p\nchanges:\n  - kind: doc.duplicate\n    fromDocId: Pages/home\n    toDocId: Pages/copy\n'
      )
    );
    expect(res.ok).toBe(true);
    expect(client.state.docs['Pages/copy']).toEqual({
      hero: {title: 'Original'},
    });
    // The copy must be independent of the source.
    client.state.docs['Pages/copy'].hero.title = 'Changed';
    expect(client.state.docs['Pages/home'].hero.title).toBe('Original');
  });

  it('fails schema validation for a wrongly-typed field', async () => {
    const client = createStubClient({
      docs: {'Pages/home': {hero: {title: 'Old'}}},
    });
    const res = await applyProposal(
      client,
      proposalOf(
        'version: 1\nid: p\nchanges:\n  - kind: doc.edit\n    docId: Pages/home\n    ops:\n      - op: set\n        path: hero.title\n        after:\n          nested: "object"\n'
      )
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0].path).toContain('hero.title');
  });
});

describe('applyProposal dryRun', () => {
  it('resolves and reports without writing', async () => {
    const client = createStubClient({
      docs: {'Pages/home': {hero: {title: 'Old'}}},
    });
    const res = await applyProposal(
      client,
      proposalOf(
        'version: 1\nid: p\nchanges:\n  - kind: doc.edit\n    docId: Pages/home\n    ops:\n      - op: set\n        path: hero.title\n        after: "New"\n'
      ),
      {dryRun: true}
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.dryRun).toBe(true);
    expect(res.changes[0]).toMatchObject({
      kind: 'doc.edit',
      target: 'Pages/home',
      paths: ['hero.title'],
    });
    expect(client.saved).toHaveLength(0);
    expect(client.state.docs['Pages/home'].hero.title).toBe('Old');
  });
});

describe('applyProposal verifyBefore', () => {
  const yaml =
    'version: 1\nid: p\nchanges:\n  - kind: doc.edit\n    docId: Pages/home\n    ops:\n      - op: set\n        path: hero.title\n        before: "Expected"\n        after: "New"\n';

  it('ignores a stale `before` by default', async () => {
    const client = createStubClient({
      docs: {'Pages/home': {hero: {title: 'Drifted'}}},
    });
    const res = await applyProposal(client, proposalOf(yaml));
    expect(res.ok).toBe(true);
    expect(client.state.docs['Pages/home'].hero.title).toBe('New');
  });

  it('fails on drift when explicitly enabled', async () => {
    const client = createStubClient({
      docs: {'Pages/home': {hero: {title: 'Drifted'}}},
    });
    const res = await applyProposal(client, proposalOf(yaml), {
      verifyBefore: true,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0].message).toMatch(/no longer matches/);
    expect(res.errors[0].received).toBe('Drifted');
    expect(client.saved).toHaveLength(0);
  });

  it('passes when the `before` still matches', async () => {
    const client = createStubClient({
      docs: {'Pages/home': {hero: {title: 'Expected'}}},
    });
    const res = await applyProposal(client, proposalOf(yaml), {
      verifyBefore: true,
    });
    expect(res.ok).toBe(true);
    expect(client.state.docs['Pages/home'].hero.title).toBe('New');
  });
});

describe('applyProposal releases', () => {
  it('creates a release', async () => {
    const client = createStubClient();
    const res = await applyProposal(
      client,
      proposalOf(
        [
          'version: 1',
          'id: p',
          'changes:',
          '  - kind: release.create',
          '    releaseId: q3',
          '    ops:',
          '      - op: set',
          '        path: description',
          '        after: "Q3 launch"',
          '      - op: set',
          '        path: docIds',
          '        after:',
          '          - Pages/home',
        ].join('\n')
      )
    );
    expect(res.ok).toBe(true);
    expect(client.state.releases.q3).toMatchObject({
      description: 'Q3 launch',
      docIds: ['Pages/home'],
    });
  });

  it('appends a doc to an existing release', async () => {
    const client = createStubClient({
      releases: {q3: {id: 'q3', description: 'Q3', docIds: ['Pages/home']}},
    });
    const res = await applyProposal(
      client,
      proposalOf(
        'version: 1\nid: p\nchanges:\n  - kind: release.update\n    releaseId: q3\n    ops:\n      - op: insert_item\n        path: docIds\n        after: Pages/about\n'
      )
    );
    expect(res.ok).toBe(true);
    expect(client.state.releases.q3.docIds).toEqual([
      'Pages/home',
      'Pages/about',
    ]);
  });

  it('refuses to edit a published release', async () => {
    const client = createStubClient({
      releases: {q3: {id: 'q3', docIds: [], publishedAt: {}}},
    });
    const res = await applyProposal(
      client,
      proposalOf(
        'version: 1\nid: p\nchanges:\n  - kind: release.update\n    releaseId: q3\n    ops:\n      - op: insert_item\n        path: docIds\n        after: Pages/about\n'
      )
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0].message).toMatch(/already been published/);
  });

  it('refuses to edit a scheduled release', async () => {
    const client = createStubClient({
      releases: {q3: {id: 'q3', docIds: [], scheduledAt: {}}},
    });
    const res = await applyProposal(
      client,
      proposalOf(
        'version: 1\nid: p\nchanges:\n  - kind: release.update\n    releaseId: q3\n    ops:\n      - op: insert_item\n        path: docIds\n        after: Pages/about\n'
      )
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0].message).toMatch(/scheduled/);
  });
});

describe('applyProposal translations', () => {
  it('folds entries into a per-locale strings map', async () => {
    const client = createStubClient();
    const res = await applyProposal(
      client,
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
    expect(res.ok).toBe(true);
    expect(client.state.translations['Pages/home']).toEqual({
      Hello: {es: 'Hola', fr: 'Bonjour'},
    });
  });
});
