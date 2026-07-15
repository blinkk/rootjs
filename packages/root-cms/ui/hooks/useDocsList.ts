import {
  collection,
  getDocs,
  orderBy as queryOrderby,
  Query,
  query,
  documentId,
} from 'firebase/firestore';
import {useEffect, useState} from 'preact/hooks';
import {setDocToCache} from '../utils/doc-cache.js';
import {sortDocsManualOrder} from '../utils/doc-sort.js';
import {notifyErrors} from '../utils/notifications.js';
import {withTimeout} from '../utils/with-timeout.js';
import {useFirebase} from './useFirebase.js';

export interface UseDocsListOptions {
  orderBy: string;
  /**
   * When true, archived docs are included in the results. Defaults to false,
   * meaning archived docs are filtered out.
   */
  includeArchived?: boolean;
}

export function useDocsList(collectionId: string, options: UseDocsListOptions) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const firebase = useFirebase();
  const db = firebase.db;

  const projectId = window.__ROOT_CTX.rootConfig.projectId || 'default';
  const includeArchived = options.includeArchived ?? false;

  const listDocs = async () => {
    setLoading(true);
    const dbCollection = collection(
      db,
      'Projects',
      projectId,
      'Collections',
      collectionId,
      'Drafts'
    );
    let dbQuery: Query = dbCollection;
    const orderBy = options.orderBy;
    if (orderBy === 'modifiedAt') {
      dbQuery = query(dbCollection, queryOrderby('sys.modifiedAt', 'desc'));
    } else if (orderBy === 'modifiedAtAsc') {
      dbQuery = query(dbCollection, queryOrderby('sys.modifiedAt'));
    } else if (orderBy === 'newest') {
      dbQuery = query(dbCollection, queryOrderby('sys.createdAt', 'desc'));
    } else if (orderBy === 'oldest') {
      dbQuery = query(dbCollection, queryOrderby('sys.createdAt'));
    } else if (orderBy === 'slug') {
      dbQuery = query(dbCollection, queryOrderby(documentId()));
    } else if (orderBy === 'slugDesc') {
      dbQuery = query(dbCollection, queryOrderby(documentId(), 'desc'));
    } else if (orderBy === 'title' || orderBy === 'titleDesc') {
      const direction = orderBy === 'titleDesc' ? 'desc' : 'asc';
      const titleField = resolveTitleFieldPath(collectionId);
      dbQuery = titleField
        ? query(dbCollection, queryOrderby(titleField, direction))
        : query(dbCollection, queryOrderby(documentId(), direction));
    } else if (orderBy === 'manual') {
      // Manual order is sorted in memory below. A firestore
      // `orderBy('sys.sortKey')` query would silently exclude docs that don't
      // have a sort key yet (e.g. docs created before the `manualSorting`
      // option was enabled), so fetch in the default (document id) order.
      dbQuery = dbCollection;
    } else {
      const col = window.__ROOT_CTX.collections[collectionId] as any;
      const custom = col?.sortOptions?.find((s: any) => s.id === orderBy);
      if (custom) {
        dbQuery =
          custom.direction === 'desc'
            ? query(dbCollection, queryOrderby(custom.field, 'desc'))
            : query(dbCollection, queryOrderby(custom.field));
      }
    }
    await notifyErrors(async () => {
      const snapshot = await withTimeout(
        getDocs(dbQuery),
        undefined,
        'loading docs'
      );
      let docs: any[] = [];
      snapshot.docs.forEach((d) => {
        const data = d.data();
        const slug = d.id;
        const docId = `${collectionId}/${slug}`;
        const docData = {
          ...data,
          id: docId,
          slug: slug,
        };
        // Always cache the doc, regardless of archive state.
        setDocToCache(docId, docData);
        if (!includeArchived && (docData as any)?.sys?.archivedAt) {
          return;
        }
        docs.push(docData);
      });
      if (orderBy === 'manual') {
        docs = sortDocsManualOrder(docs);
      }
      setDocs(docs);
    });
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    listDocs();
  }, [collectionId, options.orderBy, includeArchived]);

  return [loading, listDocs, docs, setDocs] as const;
}

/**
 * Resolves the Firestore field path used to sort a collection's docs by title,
 * derived from the collection's `preview.title` config (defaults to
 * `meta.title`). Returns an empty string when the title is a template string
 * (contains `{}` placeholders) or is otherwise not a plain field path, in which
 * case callers should fall back to sorting by document id.
 */
function resolveTitleFieldPath(collectionId: string): string {
  const collection = window.__ROOT_CTX.collections[collectionId] as any;
  let title = collection?.preview?.title ?? 'meta.title';
  if (Array.isArray(title)) {
    title = title[0];
  }
  if (typeof title !== 'string' || !title || title.includes('{')) {
    return '';
  }
  return `fields.${title}`;
}
