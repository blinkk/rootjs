/**
 * Browser-side backend for the Root AI read tools.
 *
 * The `/cms/ai` chat now runs `streamText` directly in the browser, so the
 * read tools' `execute` blocks run client-side too. This module implements the
 * `CmsToolReadBackend` interface from `core/ai-tools.ts` using the Firebase web
 * SDK (reusing the read helpers in `ui/utils/doc.ts`) and reads collection
 * metadata/schemas from the CMS UI context.
 *
 * Write tools stay schema-only — they surface to `useChat`'s `onToolCall`
 * handler so the user can approve diffs before they're applied (see
 * `cmsToolHandlers.ts`).
 */
import type {ToolSet} from 'ai';
import {
  collection as fbCollection,
  getDocs,
  limit as fbLimit,
  query,
} from 'firebase/firestore';
import {
  createCmsTools,
  createReadOnlyCmsTools,
  getReleaseStatus,
  simplifyFields,
  type CmsToolDoc,
  type CmsToolReadBackend,
  type CmsToolRelease,
} from '../../../core/ai-tools.js';
import {fetchCollectionSchema} from '../../utils/collection.js';
import {
  CMSDoc,
  cmsListVersions,
  cmsReadDocVersion,
  parseDocId,
  unmarshalData,
} from '../../utils/doc.js';
import {
  Release,
  getRelease as cmsGetRelease,
  listReleases as cmsListReleases,
} from '../../utils/release.js';

/** Shapes a raw Firestore CMS doc into the model-ready tool doc. */
function shapeDoc(docId: string, raw: CMSDoc): CmsToolDoc {
  const {collection, slug} = parseDocId(docId);
  return {
    id: (raw as any).id || docId,
    collection: (raw as any).collection || collection,
    slug: (raw as any).slug || slug,
    sys: unmarshalData((raw as any).sys || {}),
    fields: unmarshalData((raw as any).fields || {}),
  };
}

/** Converts a Firestore Timestamp-ish value to epoch millis, if present. */
function toMillis(value: any): number | undefined {
  if (value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  return undefined;
}

/** Shapes a raw Firestore release into the model-ready tool release. */
export function shapeRelease(release: Release): CmsToolRelease {
  return {
    id: release.id,
    description: release.description || undefined,
    docIds: release.docIds || [],
    dataSourceIds: release.dataSourceIds || [],
    status: getReleaseStatus(release),
    createdAt: toMillis(release.createdAt),
    createdBy: release.createdBy || undefined,
    scheduledAt: toMillis(release.scheduledAt),
    scheduledBy: release.scheduledBy || undefined,
    publishedAt: toMillis(release.publishedAt),
    publishedBy: release.publishedBy || undefined,
    archivedAt: toMillis(release.archivedAt),
    archivedBy: release.archivedBy || undefined,
  };
}

/**
 * Builds a `CmsToolReadBackend` backed by the Firebase web SDK and the CMS UI
 * context (`window.__ROOT_CTX`).
 */
export function createClientCmsToolBackend(): CmsToolReadBackend {
  return {
    async listCollections() {
      const collections = window.__ROOT_CTX.collections || {};
      return Object.entries(collections).map(([id, meta]: [string, any]) => ({
        id,
        name: meta?.name,
        description: meta?.description,
      }));
    },

    async listDocs(collectionId, {mode, limit}) {
      const db = window.firebase.db;
      const projectId = window.__ROOT_CTX.rootConfig.projectId;
      const modeCollection = mode === 'published' ? 'Published' : 'Drafts';
      const colRef = fbCollection(
        db,
        'Projects',
        projectId,
        'Collections',
        collectionId,
        modeCollection
      );
      const snap = await getDocs(query(colRef, fbLimit(limit)));
      return snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: `${collectionId}/${d.id}`,
          slug: d.id,
          sys: unmarshalData(data.sys || {}),
        };
      });
    },

    async getDoc(docId, {mode}) {
      const raw = await cmsReadDocVersion(docId, mode);
      return raw ? shapeDoc(docId, raw) : null;
    },

    async getDocVersion(docId, versionId) {
      const raw = await cmsReadDocVersion(docId, versionId);
      return raw ? shapeDoc(docId, raw) : null;
    },

    async listVersions(docId, {limit}) {
      const {versions} = await cmsListVersions(docId, {limit});
      return versions.map((v: any) => ({
        versionId: v._versionId,
        sys: unmarshalData(v.sys || {}),
        tags: v.tags || [],
        publishMessage: v.publishMessage,
      }));
    },

    async getSchemaFields(collectionId) {
      try {
        const schema = await fetchCollectionSchema(collectionId);
        return simplifyFields(schema.fields || []);
      } catch (err) {
        console.error(`failed to load schema for ${collectionId}:`, err);
        return null;
      }
    },

    async listReleases({limit}) {
      const releases = await cmsListReleases();
      return releases.slice(0, limit).map(shapeRelease);
    },

    async getRelease(releaseId) {
      const release = await cmsGetRelease(releaseId);
      return release ? shapeRelease(release) : null;
    },
  };
}

/** Full CMS tool set (read tools run client-side; write tools schema-only). */
export function createClientCmsTools(): ToolSet {
  return createCmsTools(createClientCmsToolBackend());
}

/** Read-only CMS tool set (used by the "Edit with AI" diff-viewer flow). */
export function createReadOnlyClientCmsTools(): ToolSet {
  return createReadOnlyCmsTools(createClientCmsToolBackend());
}
