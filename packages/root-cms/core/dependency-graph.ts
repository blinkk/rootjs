import path from 'node:path';
import {RootConfig} from '@blinkk/root';
import {Firestore, Query, Timestamp} from 'firebase-admin/firestore';
import glob from 'tiny-glob';
import {getCmsPlugin, unmarshalData} from './client.js';

interface PartialCMSDoc {
  id?: string;
  collection: string;
  slug: string;
  fields?: any;
  sys: {
    modifiedAt: Timestamp;
  };
}

interface DependencyGraph {
  updatedAt?: Timestamp;
  nodes: Record<string, string[]>;
}

type GraphMode = 'draft' | 'published';

/**
 * Maintains a dependency graph of CMS docs and their references.
 */
export class DependencyGraphService {
  private readonly rootConfig: RootConfig;
  private readonly projectId: string;
  private readonly db: Firestore;
  private readonly enabled: boolean;

  constructor(rootConfig: RootConfig) {
    this.rootConfig = rootConfig;
    const cmsPlugin = getCmsPlugin(rootConfig);
    const cmsPluginOptions = cmsPlugin.getConfig();
    this.projectId = cmsPluginOptions.id || 'default';
    this.db = cmsPlugin.getFirestore();
    this.enabled = Boolean(cmsPluginOptions.experiments?.dependencyGraphApi);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async updateDependencyGraph() {
    if (!this.enabled) {
      return;
    }

    const lastRun = await this.getLastRun();
    const now = Timestamp.now().toMillis();
    const [draftDocs, publishedDocs] = await Promise.all([
      this.getDocsModifiedAfter('draft', lastRun),
      this.getDocsModifiedAfter('published', lastRun),
    ]);

    if (draftDocs.length === 0 && publishedDocs.length === 0) {
      await this.saveLastRun(now);
      return;
    }

    const [draftGraph, publishedGraph] = await Promise.all([
      this.getDependencyGraph('draft'),
      this.getDependencyGraph('published'),
    ]);

    if (draftDocs.length > 0) {
      const updatedDraftGraph = this.updateGraphForDocs(draftGraph, draftDocs);
      await this.saveDependencyGraph('draft', updatedDraftGraph);
    }

    if (publishedDocs.length > 0) {
      const updatedPublishedGraph = this.updateGraphForDocs(
        publishedGraph,
        publishedDocs
      );
      await this.saveDependencyGraph('published', updatedPublishedGraph);
    }

    await this.saveLastRun(now);
  }

  private updateGraphForDocs(
    graph: DependencyGraph,
    docs: PartialCMSDoc[]
  ): DependencyGraph {
    const nodes = {...graph.nodes};
    docs.forEach((doc) => {
      const docId = this.getDocId(doc);
      if (!docId) {
        return;
      }
      const references = this.extractReferences(doc);
      nodes[docId] = references;
    });
    return {
      nodes,
      updatedAt: Timestamp.now(),
    };
  }

  private getDocId(doc: PartialCMSDoc): string | null {
    if (doc.id) {
      return doc.id;
    }
    if (doc.collection && doc.slug) {
      return `${doc.collection}/${doc.slug}`;
    }
    return null;
  }

  private extractReferences(doc: PartialCMSDoc): string[] {
    const references = new Set<string>();
    const fields = unmarshalData(doc.fields || {});

    const walk = (value: any) => {
      if (Array.isArray(value)) {
        value.forEach((item) => walk(item));
        return;
      }
      if (!value || typeof value !== 'object') {
        return;
      }

      const refId = this.getReferenceId(value);
      if (refId) {
        references.add(refId);
      }

      Object.values(value).forEach((child) => walk(child));
    };

    walk(fields);
    return Array.from(references).sort();
  }

  private getReferenceId(value: any): string | null {
    if (
      typeof value?.id === 'string' &&
      typeof value.collection === 'string' &&
      typeof value.slug === 'string'
    ) {
      return value.id || `${value.collection}/${value.slug}`;
    }
    if (typeof value?.id === 'string') {
      return value.id;
    }
    if (typeof value?.collection === 'string' && typeof value?.slug === 'string') {
      return `${value.collection}/${value.slug}`;
    }
    return null;
  }

  private async getDependencyGraph(mode: GraphMode): Promise<DependencyGraph> {
    const doc = await this.getDependencyGraphRef(mode).get();
    if (!doc.exists) {
      return {nodes: {}};
    }
    const data = doc.data() as DependencyGraph;
    return {
      nodes: data.nodes || {},
      updatedAt: data.updatedAt,
    };
  }

  private async saveDependencyGraph(
    mode: GraphMode,
    graph: DependencyGraph
  ) {
    await this.getDependencyGraphRef(mode).set(graph);
  }

  private getDependencyGraphRef(mode: GraphMode) {
    return this.db.doc(`Projects/${this.projectId}/DependencyGraph/${mode}`);
  }

  private async getLastRun(): Promise<number> {
    const projectDocRef = this.db.collection('Projects').doc(this.projectId);
    const projectDoc = await projectDocRef.get();
    if (projectDoc.exists) {
      const data = projectDoc.data() || {};
      const ts = data.dependencyGraphApiLastRun as Timestamp;
      if (ts) {
        return ts.toMillis();
      }
    }
    return 0;
  }

  private async saveLastRun(millis: number) {
    const ts = Timestamp.fromMillis(millis);
    const projectDocRef = this.db.collection('Projects').doc(this.projectId);
    await projectDocRef.set({dependencyGraphApiLastRun: ts}, {merge: true});
  }

  private async getDocsModifiedAfter(
    mode: GraphMode,
    millis: number
  ): Promise<PartialCMSDoc[]> {
    const ts = Timestamp.fromMillis(millis);
    const results: PartialCMSDoc[] = [];
    const collectionIds = await this.listCollections();
    const modeCollection = mode === 'draft' ? 'Drafts' : 'Published';
    for (const collectionId of collectionIds) {
      const collectionPath = `Projects/${this.projectId}/Collections/${collectionId}/${modeCollection}`;
      const query: Query = this.db
        .collection(collectionPath)
        .where('sys.modifiedAt', '>=', ts);
      const querySnapshot = await query.get();
      querySnapshot.forEach((doc) => {
        results.push(doc.data() as PartialCMSDoc);
      });
    }
    return results;
  }

  private async listCollections(): Promise<string[]> {
    const collectionIds: string[] = [];
    const collectionFileNames = await glob('*.schema.ts', {
      cwd: path.join(this.rootConfig.rootDir, 'collections'),
    });
    collectionFileNames.forEach((filename) => {
      collectionIds.push(filename.slice(0, -10));
    });
    return collectionIds;
  }
}
