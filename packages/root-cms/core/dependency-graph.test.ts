/**
 * Tests for the dependency graph: pure extraction/traversal units, plus
 * Firestore emulator-backed integration tests for DependencyGraphService
 * (see translations-manager.test.ts for details on the emulator setup).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {getApps, initializeApp} from 'firebase-admin/app';
import {Timestamp, getFirestore} from 'firebase-admin/firestore';
import {beforeEach, describe, expect, it} from 'vitest';
import {RootCMSClient, marshalData} from './client.js';
import {
  DependencyGraph,
  DependencyGraphService,
  extractRefDocIds,
  getReferenceDocId,
  isCollectionTracked,
  resolveDependencyGraphConfig,
  resolveDependencyGraphFilters,
} from './dependency-graph.js';

describe('resolveDependencyGraphConfig', () => {
  it('treats `true` as enabled with default options', () => {
    expect(resolveDependencyGraphConfig(true)).toEqual({});
  });

  it('treats a config object as enabled', () => {
    const config = {includeCollections: ['Pages']};
    expect(resolveDependencyGraphConfig(config)).toBe(config);
  });

  it('treats unset/false as disabled', () => {
    expect(resolveDependencyGraphConfig(undefined)).toBe(null);
    expect(resolveDependencyGraphConfig(false)).toBe(null);
  });
});

describe('dependency graph filters', () => {
  it('treats unset/empty config as "track everything"', () => {
    const filters = resolveDependencyGraphFilters(undefined);
    expect(isCollectionTracked(filters, 'Pages')).toBe(true);
    const emptyFilters = resolveDependencyGraphFilters({
      includeCollections: [],
    });
    expect(isCollectionTracked(emptyFilters, 'Pages')).toBe(true);
  });

  it('respects includeCollections and excludeCollections', () => {
    const filters = resolveDependencyGraphFilters({
      includeCollections: ['Pages', 'Posts'],
      excludeCollections: ['Posts'],
    });
    expect(isCollectionTracked(filters, 'Pages')).toBe(true);
    expect(isCollectionTracked(filters, 'Posts')).toBe(false);
    expect(isCollectionTracked(filters, 'Other')).toBe(false);
  });
});

describe('getReferenceDocId', () => {
  it('matches values saved by reference fields', () => {
    expect(
      getReferenceDocId({id: 'Pages/foo', collection: 'Pages', slug: 'foo'})
    ).toBe('Pages/foo');
  });

  it('normalizes slugs with slashes', () => {
    expect(
      getReferenceDocId({
        id: 'Pages/foo/bar',
        collection: 'Pages',
        slug: 'foo/bar',
      })
    ).toBe('Pages/foo--bar');
    expect(
      getReferenceDocId({
        id: 'Pages/foo--bar',
        collection: 'Pages',
        slug: 'foo--bar',
      })
    ).toBe('Pages/foo--bar');
  });

  it('rejects values with an inconsistent id', () => {
    expect(
      getReferenceDocId({id: 'Other/foo', collection: 'Pages', slug: 'foo'})
    ).toBe(null);
    expect(
      getReferenceDocId({id: 'Pages/other', collection: 'Pages', slug: 'foo'})
    ).toBe(null);
  });

  it('rejects values without the reference shape', () => {
    expect(getReferenceDocId(null)).toBe(null);
    expect(getReferenceDocId('Pages/foo')).toBe(null);
    expect(getReferenceDocId(['Pages/foo'])).toBe(null);
    expect(getReferenceDocId({id: 'Pages/foo'})).toBe(null);
    expect(getReferenceDocId({id: 'Pages/foo', collection: 'Pages'})).toBe(
      null
    );
    expect(getReferenceDocId({id: 'foo', collection: '', slug: 'foo'})).toBe(
      null
    );
    expect(getReferenceDocId({id: 123, collection: 'Pages', slug: 'foo'})).toBe(
      null
    );
  });
});

describe('extractRefDocIds', () => {
  it('extracts a top-level reference field', () => {
    const fields = {
      author: {id: 'Authors/alice', collection: 'Authors', slug: 'alice'},
    };
    expect(extractRefDocIds(fields)).toEqual(['Authors/alice']);
  });

  it('extracts refs from plain arrays (references field)', () => {
    const fields = {
      related: [
        {id: 'Posts/a', collection: 'Posts', slug: 'a'},
        {id: 'Posts/b', collection: 'Posts', slug: 'b'},
      ],
    };
    expect(extractRefDocIds(fields)).toEqual(['Posts/a', 'Posts/b']);
  });

  it('extracts refs from marshaled data (_array objects)', () => {
    const fields = marshalData({
      blocks: [
        {
          _type: 'RelatedPosts',
          posts: [
            {id: 'Posts/a', collection: 'Posts', slug: 'a'},
            {id: 'Posts/b', collection: 'Posts', slug: 'b'},
          ],
        },
        {
          _type: 'Hero',
          cta: {
            link: {id: 'Pages/about', collection: 'Pages', slug: 'about'},
          },
        },
      ],
    });
    expect(extractRefDocIds(fields)).toEqual([
      'Pages/about',
      'Posts/a',
      'Posts/b',
    ]);
  });

  it('dedupes and sorts extracted ids', () => {
    const ref = {id: 'Posts/a', collection: 'Posts', slug: 'a'};
    const fields = {
      one: {...ref},
      two: {...ref},
      zed: {id: 'Authors/z', collection: 'Authors', slug: 'z'},
    };
    expect(extractRefDocIds(fields)).toEqual(['Authors/z', 'Posts/a']);
  });

  it('ignores non-reference data', () => {
    const fields = {
      title: 'Hello',
      count: 3,
      enabled: true,
      empty: null,
      meta: {description: 'World'},
      richtext: {
        time: 123,
        version: '2.28.2',
        blocks: [{type: 'paragraph', data: {text: 'hi'}}],
      },
      // Same keys as a reference but inconsistent id.
      notARef: {id: 'foo', collection: 'Pages', slug: 'bar'},
    };
    expect(extractRefDocIds(fields)).toEqual([]);
    expect(extractRefDocIds(null)).toEqual([]);
    expect(extractRefDocIds(undefined)).toEqual([]);
    expect(extractRefDocIds('string')).toEqual([]);
  });

  it('guards against pathological nesting depth', () => {
    let node: any = {
      ref: {id: 'Posts/deep', collection: 'Posts', slug: 'deep'},
    };
    for (let i = 0; i < 150; i++) {
      node = {child: node};
    }
    // The deeply-buried ref is beyond the depth cap and ignored; the walk
    // terminates without a stack overflow.
    expect(extractRefDocIds(node)).toEqual([]);
  });
});

describe('DependencyGraph', () => {
  const edges = {
    'Pages/index': ['Posts/a', 'Posts/b'],
    'Posts/a': ['Authors/alice'],
    'Posts/b': ['Authors/alice', 'Authors/bob'],
    'Authors/alice': [],
    'Cycles/a': ['Cycles/b'],
    'Cycles/b': ['Cycles/a'],
  };

  function createGraph() {
    return new DependencyGraph('draft', edges, 123);
  }

  it('resolves direct dependencies with transitive: false', () => {
    const graph = createGraph();
    expect(graph.getDependencies('Pages/index', {transitive: false})).toEqual([
      'Posts/a',
      'Posts/b',
    ]);
  });

  it('resolves transitive dependencies by default', () => {
    const graph = createGraph();
    expect(graph.getDependencies('Pages/index')).toEqual([
      'Authors/alice',
      'Authors/bob',
      'Posts/a',
      'Posts/b',
    ]);
  });

  it('accepts multiple input docs and excludes them from the result', () => {
    const graph = createGraph();
    expect(graph.getDependencies(['Pages/index', 'Posts/a'])).toEqual([
      'Authors/alice',
      'Authors/bob',
      'Posts/b',
    ]);
  });

  it('handles reference cycles', () => {
    const graph = createGraph();
    expect(graph.getDependencies('Cycles/a')).toEqual(['Cycles/b']);
    expect(graph.getDependencies(['Cycles/a', 'Cycles/b'])).toEqual([]);
  });

  it('returns an empty list for unknown docs', () => {
    const graph = createGraph();
    expect(graph.getDependencies('Pages/unknown')).toEqual([]);
  });

  it('normalizes input doc ids', () => {
    const graph = new DependencyGraph(
      'draft',
      {'Pages/foo--bar': ['Posts/a']},
      123
    );
    expect(graph.getDependencies('Pages/foo/bar')).toEqual(['Posts/a']);
  });

  it('resolves direct dependents', () => {
    const graph = createGraph();
    expect(graph.getDependents('Authors/alice', {transitive: false})).toEqual([
      'Posts/a',
      'Posts/b',
    ]);
  });

  it('resolves transitive dependents by default', () => {
    const graph = createGraph();
    expect(graph.getDependents('Authors/alice')).toEqual([
      'Pages/index',
      'Posts/a',
      'Posts/b',
    ]);
  });
});

const FIREBASE_PROJECT_ID = 'rootjs-cms-admin-tests';

function getTestApp() {
  const existing = getApps().find((app) => app.name === 'dependency-test');
  if (existing) {
    return existing;
  }
  return initializeApp({projectId: FIREBASE_PROJECT_ID}, 'dependency-test');
}

let projectCounter = 0;

interface TestProject {
  rootConfig: any;
  cmsClient: RootCMSClient;
  /** Creates a service using the project's plugin config. */
  createService: () => DependencyGraphService;
}

/**
 * Creates an isolated test project backed by the Firestore emulator, with a
 * temp rootDir containing empty schema files for the given collections.
 */
function createTestProject(options?: {
  collections?: string[];
  dependencyGraph?: any;
}): TestProject {
  const app = getTestApp();
  const db = getFirestore(app);
  const projectId = `dep-test-${Date.now()}-${projectCounter++}`;
  const collections = options?.collections ?? ['Pages', 'Posts', 'Authors'];
  // Default to enabled, unless the caller explicitly sets the option
  // (including an explicit `undefined`, which tests the unset config path).
  const dependencyGraph =
    options && 'dependencyGraph' in options ? options.dependencyGraph : true;
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'root-cms-dep-test-'));
  fs.mkdirSync(path.join(rootDir, 'collections'));
  for (const collectionId of collections) {
    fs.writeFileSync(
      path.join(rootDir, 'collections', `${collectionId}.schema.ts`),
      ''
    );
  }
  const plugin = {
    name: 'root-cms',
    getConfig: () => ({
      id: projectId,
      firebaseConfig: {
        apiKey: 'test',
        authDomain: 'test',
        projectId: FIREBASE_PROJECT_ID,
        storageBucket: 'test',
      },
      dependencyGraph,
    }),
    getFirebaseApp: () => app,
    getFirestore: () => db,
  };
  const rootConfig: any = {
    rootDir,
    i18n: {locales: ['en']},
    plugins: [plugin],
  };
  return {
    rootConfig,
    cmsClient: new RootCMSClient(rootConfig),
    createService: () => new DependencyGraphService(rootConfig),
  };
}

async function seedDoc(
  cmsClient: RootCMSClient,
  docId: string,
  fields: any,
  options?: {mode?: 'draft' | 'published'; modifiedAt?: Timestamp}
) {
  const mode = options?.mode ?? 'draft';
  const modeCollection = mode === 'draft' ? 'Drafts' : 'Published';
  const [collection, slug] = docId.split('/');
  const now = options?.modifiedAt ?? Timestamp.now();
  const sys: any = {
    createdAt: now,
    createdBy: 'test',
    modifiedAt: now,
    modifiedBy: 'test',
    locales: ['en'],
  };
  if (mode === 'published') {
    sys.publishedAt = now;
    sys.publishedBy = 'test';
  }
  await cmsClient.db
    .doc(
      `Projects/${cmsClient.projectId}/Collections/${collection}/${modeCollection}/${slug}`
    )
    .set({
      id: docId,
      collection,
      slug,
      sys,
      fields: marshalData(fields),
    });
}

function ref(docId: string) {
  const [collection, slug] = docId.split('/');
  return {id: docId, collection, slug};
}

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  'DependencyGraphService',
  () => {
    let project: TestProject;

    beforeEach(() => {
      project = createTestProject();
    });

    it('is disabled unless the dependencyGraph option is set', async () => {
      const disabled = createTestProject({dependencyGraph: undefined});
      const service = disabled.createService();
      expect(service.isEnabled()).toBe(false);
      expect(await service.runCronUpdate()).toBe(null);
      await expect(service.getGraph('draft')).rejects.toThrow(/not enabled/);
      const status = await service.getStatus();
      expect(status.enabled).toBe(false);
      expect(status.lastRun).toBe(null);
    });

    it('builds the graph from draft and published docs', async () => {
      const {cmsClient, createService} = project;
      await seedDoc(cmsClient, 'Pages/index', {
        blocks: [{_type: 'Featured', posts: [ref('Posts/a'), ref('Posts/b')]}],
      });
      await seedDoc(cmsClient, 'Posts/a', {author: ref('Authors/alice')});
      await seedDoc(cmsClient, 'Posts/b', {title: 'No refs'});
      await seedDoc(
        cmsClient,
        'Pages/index',
        {blocks: [{_type: 'Featured', posts: [ref('Posts/a')]}]},
        {mode: 'published'}
      );

      const service = createService();
      const result = await service.rebuildGraph();
      expect(result.skipped).toBe(false);
      expect(result.refDocCounts).toEqual({draft: 2, published: 1});
      expect(result.refCounts).toEqual({draft: 3, published: 1});

      const draftGraph = await service.getGraph('draft');
      expect(draftGraph.edges).toEqual({
        'Pages/index': ['Posts/a', 'Posts/b'],
        'Posts/a': ['Authors/alice'],
      });
      expect(draftGraph.getDependencies('Pages/index')).toEqual([
        'Authors/alice',
        'Posts/a',
        'Posts/b',
      ]);

      const publishedGraph = await service.getGraph('published');
      expect(publishedGraph.edges).toEqual({
        'Pages/index': ['Posts/a'],
      });
    });

    it('resolves dependencies via the cms client', async () => {
      const {cmsClient} = project;
      await seedDoc(cmsClient, 'Pages/index', {author: ref('Authors/alice')});
      await project.createService().rebuildGraph();

      const graph = await cmsClient.getDependencyGraph({mode: 'draft'});
      expect(graph.getDependencies('Pages/index')).toEqual(['Authors/alice']);
      expect(
        await cmsClient.getDocDependencies(['Pages/index'], {mode: 'draft'})
      ).toEqual(['Authors/alice']);
    });

    it('returns an empty graph when the graph has never been built', async () => {
      const service = project.createService();
      const graph = await service.getGraph('draft');
      expect(graph.edges).toEqual({});
      expect(graph.lastRun).toBe(null);
    });

    it('incrementally updates changed docs via runCronUpdate', async () => {
      const {cmsClient, createService} = project;
      await seedDoc(cmsClient, 'Pages/index', {author: ref('Authors/alice')});
      const service = createService();
      await service.rebuildGraph();

      // No changes — the update is skipped.
      expect(await service.runCronUpdate()).toBe(null);

      // Re-seed the doc with different refs (bumps sys.modifiedAt).
      await seedDoc(cmsClient, 'Pages/index', {author: ref('Authors/bob')});
      const result = await service.runCronUpdate();
      expect(result).not.toBe(null);
      expect(result!.skipped).toBe(false);

      const graph = await service.getGraph('draft');
      expect(graph.edges).toEqual({'Pages/index': ['Authors/bob']});
    });

    it('respects the min interval throttle', async () => {
      const {cmsClient, createService} = project;
      await seedDoc(cmsClient, 'Pages/index', {author: ref('Authors/alice')});
      const service = createService();
      await service.rebuildGraph();

      await seedDoc(cmsClient, 'Pages/index', {author: ref('Authors/bob')});
      // lastRun was moments ago, so a large min interval skips the update.
      expect(await service.runCronUpdate({minIntervalMs: 60 * 60 * 1000})).toBe(
        null
      );
      expect(await service.runCronUpdate()).not.toBe(null);
    });

    it('removes edges when docs are deleted', async () => {
      const {cmsClient, createService} = project;
      await seedDoc(cmsClient, 'Pages/index', {author: ref('Authors/alice')});
      await seedDoc(cmsClient, 'Posts/a', {author: ref('Authors/alice')});
      const service = createService();
      await service.rebuildGraph();

      await cmsClient.db
        .doc(`Projects/${cmsClient.projectId}/Collections/Posts/Drafts/a`)
        .delete();

      // The deletion is detected (via count aggregation) and reconciled.
      const result = await service.runCronUpdate();
      expect(result).not.toBe(null);
      const graph = await service.getGraph('draft');
      expect(graph.edges).toEqual({'Pages/index': ['Authors/alice']});
    });

    it('removes edges when a doc no longer has refs', async () => {
      const {cmsClient, createService} = project;
      await seedDoc(cmsClient, 'Pages/index', {author: ref('Authors/alice')});
      const service = createService();
      await service.rebuildGraph();

      await seedDoc(cmsClient, 'Pages/index', {title: 'No more refs'});
      await service.runCronUpdate();
      const graph = await service.getGraph('draft');
      expect(graph.edges).toEqual({});
    });

    it('updates published edges when docs are published', async () => {
      const {cmsClient, createService} = project;
      await seedDoc(cmsClient, 'Pages/index', {author: ref('Authors/alice')});
      const service = createService();
      await service.rebuildGraph();

      let publishedGraph = await service.getGraph('published');
      expect(publishedGraph.edges).toEqual({});

      // Publishing copies the draft to Published and stamps sys.publishedAt.
      await cmsClient.publishDocs(['Pages/index'], {publishedBy: 'test'});
      const result = await service.runCronUpdate();
      expect(result).not.toBe(null);
      publishedGraph = await service.getGraph('published');
      expect(publishedGraph.edges).toEqual({
        'Pages/index': ['Authors/alice'],
      });
    });

    it('picks up collections added after the initial build', async () => {
      const {cmsClient, rootConfig, createService} = project;
      await seedDoc(cmsClient, 'Pages/index', {author: ref('Authors/alice')});
      const service = createService();
      await service.rebuildGraph();

      // Seed docs in a collection that has no schema file yet, then add the
      // schema file. The doc's modifiedAt pre-dates lastRun (so the changed
      // probe misses it), but the new collection is detected via the doc
      // count and fully scanned on the next incremental update.
      await seedDoc(
        cmsClient,
        'Events/launch',
        {page: ref('Pages/index')},
        {modifiedAt: Timestamp.fromMillis(Date.now() - 60 * 60 * 1000)}
      );
      fs.writeFileSync(
        path.join(rootConfig.rootDir, 'collections', 'Events.schema.ts'),
        ''
      );
      const result = await createService().runCronUpdate();
      expect(result).not.toBe(null);
      const graph = await createService().getGraph('draft');
      expect(graph.edges).toEqual({
        'Pages/index': ['Authors/alice'],
        'Events/launch': ['Pages/index'],
      });
    });

    it('scopes the graph to included collections', async () => {
      const scoped = createTestProject({
        dependencyGraph: {includeCollections: ['Pages']},
      });
      await seedDoc(scoped.cmsClient, 'Pages/index', {
        author: ref('Authors/alice'),
      });
      await seedDoc(scoped.cmsClient, 'Posts/a', {
        author: ref('Authors/alice'),
      });
      const service = scoped.createService();
      await service.rebuildGraph();
      const graph = await service.getGraph('draft');
      // Posts is not scanned for outgoing refs, but referenced ids in Pages
      // docs are recorded as-is.
      expect(graph.edges).toEqual({'Pages/index': ['Authors/alice']});
    });

    it('reports status counts', async () => {
      const {cmsClient, createService} = project;
      await seedDoc(cmsClient, 'Pages/index', {
        related: [ref('Posts/a'), ref('Posts/b')],
      });
      const service = createService();
      await service.rebuildGraph();
      const status = await service.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.lastRun).not.toBe(null);
      expect(status.draft).toEqual({docsWithRefs: 1, refs: 2});
      expect(status.published).toEqual({docsWithRefs: 0, refs: 0});
    });
  }
);
