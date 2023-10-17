/** @deprecated Use client.ts instead. */

import {RootConfig} from '@blinkk/root';
import {
  FieldValue,
  Query,
  Timestamp,
  getFirestore,
} from 'firebase-admin/firestore';
import {getCmsPlugin, unmarshalData} from './client.js';

/**
 * Retrieves a doc from Root.js CMS.
 * @deprecated Use RootCMSClient.getDoc() instead.
 */
export async function getDoc<T>(
  rootConfig: RootConfig,
  collectionId: string,
  slug: string,
  options: {
    mode: 'draft' | 'published';
  }
): Promise<T | null> {
  const cmsPlugin = getCmsPlugin(rootConfig);
  const cmsPluginOptions = cmsPlugin.getConfig();
  const projectId = cmsPluginOptions.id || 'default';
  const mode = options.mode;
  const modeCollection = mode === 'draft' ? 'Drafts' : 'Published';
  const app = cmsPlugin.getFirebaseApp();
  const db = getFirestore(app);
  // Slugs with slashes are encoded as `--` in the DB.
  slug = slug.replaceAll('/', '--');
  const dbPath = `Projects/${projectId}/Collections/${collectionId}/${modeCollection}/${slug}`;
  const docRef = db.doc(dbPath);
  const doc = await docRef.get();
  if (doc.exists) {
    const data = doc.data();
    return unmarshalData(data) as T;
  }
  console.log(`doc not found: ${dbPath}`);
  return null;
}

/**
 * Lists docs from a Root.js CMS collection.
 * @deprecated Use RootCMSClient.listDocs() instead.
 */
export async function listDocs<T>(
  rootConfig: RootConfig,
  collectionId: string,
  options: {
    mode: 'draft' | 'published';
    offset?: number;
    limit?: number;
    orderBy?: string;
    orderByDirection?: 'asc' | 'desc';
    query?: (query: Query) => Query;
  }
): Promise<{docs: T[]}> {
  const cmsPlugin = getCmsPlugin(rootConfig);
  const cmsPluginOptions = cmsPlugin.getConfig();
  const projectId = cmsPluginOptions.id || 'default';
  const mode = options.mode;
  const modeCollection = mode === 'draft' ? 'Drafts' : 'Published';
  const app = cmsPlugin.getFirebaseApp();
  const db = getFirestore(app);
  const dbPath = `Projects/${projectId}/Collections/${collectionId}/${modeCollection}`;
  let query: Query = db.collection(dbPath);
  if (options.limit) {
    query = query.limit(options.limit);
  }
  if (options.offset) {
    query = query.offset(options.offset);
  }
  if (options.orderBy) {
    query = query.orderBy(options.orderBy, options.orderByDirection);
  }
  if (options.query) {
    query = options.query(query);
  }
  const results = await query.get();
  const docs: T[] = [];
  results.forEach((result) => {
    const doc = unmarshalData(result.data()) as T;
    docs.push(doc);
  });
  return {docs};
}

/**
 * Returns the number of docs in a Root.js CMS collection.
 * @deprecated Use RootCMSClient.getDocsCount() instead.
 */
export async function numDocs(
  rootConfig: RootConfig,
  collectionId: string,
  options: {
    mode: 'draft' | 'published';
    query?: (query: Query) => Query;
  }
) {
  const cmsPlugin = getCmsPlugin(rootConfig);
  const cmsPluginOptions = cmsPlugin.getConfig();
  const projectId = cmsPluginOptions.id || 'default';
  const mode = options.mode;
  const modeCollection = mode === 'draft' ? 'Drafts' : 'Published';
  const app = cmsPlugin.getFirebaseApp();
  const db = getFirestore(app);
  const dbPath = `Projects/${projectId}/Collections/${collectionId}/${modeCollection}`;
  let query: Query = db.collection(dbPath);
  if (options.query) {
    query = options.query(query);
  }
  const results = await query.count().get();
  const count = results.data().count;
  return count;
}

/**
 * Publishes scheduled docs.
 * @deprecated Use RootCMSClient.publishScheduledDocs() instead.
 */
export async function publishScheduledDocs(rootConfig: RootConfig) {
  const cmsPlugin = getCmsPlugin(rootConfig);
  const cmsPluginOptions = cmsPlugin.getConfig();
  const projectId = cmsPluginOptions.id || 'default';
  const app = cmsPlugin.getFirebaseApp();
  const db = getFirestore(app);

  const projectCollectionsPath = `Projects/${projectId}/Collections`;
  const now = Math.ceil(new Date().getTime());

  const snapshot = await db.collectionGroup('Scheduled').get();
  const docs = snapshot.docs
    .filter((d) => {
      // Filter docs by project.
      if (!d.ref.path.startsWith(projectCollectionsPath)) {
        return false;
      }
      // Filter docs where scheduledAt is in the past.
      // NOTE(stevenle): the filtering is done manually instead of using a query
      // to avoid having to create an index in firestore.
      const data = d.data() || {};
      const scheduledAt: Timestamp | undefined = data.sys?.scheduledAt;
      return (
        scheduledAt && scheduledAt.toMillis && scheduledAt.toMillis() <= now
      );
    })
    .map((d) => {
      const dbPath = d.ref.path;
      const segments = dbPath.split('/');
      const slug = segments.at(-1);
      const collection = segments.at(-3);
      const id = `${collection}/${slug}`;
      return {
        data: d.data(),
        id,
        collection,
        slug,
      };
    });

  if (docs.length === 0) {
    return [];
  }

  // Each transaction or batch can write a max of 500 ops.
  // https://firebase.google.com/docs/firestore/manage-data/transactions
  let batchCount = 0;
  const batch = db.batch();
  const publishedDocs: any[] = [];
  for (const doc of docs) {
    const {id, collection, slug, data} = doc;
    const draftRef = db.doc(
      `${projectCollectionsPath}/${collection}/Drafts/${slug}`
    );
    const scheduledRef = db.doc(
      `${projectCollectionsPath}/${collection}/Scheduled/${slug}`
    );
    const publishedRef = db.doc(
      `${projectCollectionsPath}/${collection}/Published/${slug}`
    );
    const {scheduledAt, scheduledBy, ...sys} = data.sys || {};

    // Only update `firstPublished` if it doesn't already exist.
    const firstPublishedAt = sys.firstPublishedAt ?? scheduledAt;
    const firstPublishedBy = sys.firstPublishedBy ?? (scheduledBy || '');

    // Save published doc.
    batch.set(publishedRef, {
      id,
      collection,
      slug,
      fields: data.fields || {},
      sys: {
        ...sys,
        firstPublishedAt: firstPublishedAt,
        firstPublishedBy: firstPublishedBy,
        publishedAt: FieldValue.serverTimestamp(),
        publishedBy: scheduledBy || '',
      },
    });
    batchCount += 1;

    // Remove published doc.
    batch.delete(scheduledRef);
    batchCount += 1;

    // Update the draft doc to remove `scheduledAt` and `scheduledBy` fields
    // and update the `publishedAt` and `publishedBy` fields.
    batch.update(draftRef, {
      'sys.scheduledAt': FieldValue.delete(),
      'sys.scheduledBy': FieldValue.delete(),
      'sys.firstPublishedAt': firstPublishedAt,
      'sys.firstPublishedBy': firstPublishedBy,
      'sys.publishedAt': FieldValue.serverTimestamp(),
      'sys.publishedBy': scheduledBy || '',
    });
    batchCount += 1;

    publishedDocs.push(doc);

    if (batchCount >= 498) {
      break;
    }
  }

  await batch.commit();
  console.log(`published ${publishedDocs.length} docs!`);
  return publishedDocs;
}
