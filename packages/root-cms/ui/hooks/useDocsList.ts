import {
  collection,
  getDocs,
  orderBy as queryOrderby,
  Query,
  query,
  documentId,
} from 'firebase/firestore';
import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import {setDocToCache} from '../utils/doc-cache.js';
import {queryDocsWithSelect} from '../utils/firestore-rest.js';
import {notifyErrors} from '../utils/notifications.js';
import {useFirebase} from './useFirebase.js';

/** Number of docs to process per batch before yielding to the browser. */
const BATCH_SIZE = 100;

/**
 * Returns the Firestore REST API ordering config for a given `orderBy` value.
 */
function getRestOrderBy(
  orderBy: string,
  collectionId: string
): {field: string; direction: 'ASCENDING' | 'DESCENDING'} | undefined {
  switch (orderBy) {
    case 'modifiedAt':
      return {field: 'sys.modifiedAt', direction: 'DESCENDING'};
    case 'newest':
      return {field: 'sys.createdAt', direction: 'DESCENDING'};
    case 'oldest':
      return {field: 'sys.createdAt', direction: 'ASCENDING'};
    case 'slug':
      return {field: '__name__', direction: 'ASCENDING'};
    case 'slugDesc':
      return {field: '__name__', direction: 'DESCENDING'};
    default: {
      const col = window.__ROOT_CTX.collections[collectionId] as any;
      const custom = col?.sortOptions?.find((s: any) => s.id === orderBy);
      if (custom) {
        return {
          field: custom.field,
          direction: custom.direction === 'desc' ? 'DESCENDING' : 'ASCENDING',
        };
      }
      return undefined;
    }
  }
}

/**
 * Returns the Firestore field paths needed for the lightweight list view.
 * Includes `sys` (for status, dates) and the preview title/image paths.
 */
function getPreviewFieldPaths(collectionId: string): string[] {
  const col = window.__ROOT_CTX.collections[collectionId] as any;
  const paths = new Set<string>();
  paths.add('sys');

  const titlePath: string = col?.preview?.title || 'meta.title';
  paths.add(`fields.${titlePath.split('.')[0]}`);

  const imagePaths: string | string[] | undefined = col?.preview?.image;
  if (Array.isArray(imagePaths)) {
    for (const p of imagePaths) {
      paths.add(`fields.${p.split(/[.\[]/)[0]}`);
    }
  } else if (typeof imagePaths === 'string') {
    paths.add(`fields.${imagePaths.split(/[.\[]/)[0]}`);
  } else {
    paths.add('fields.meta');
  }

  return Array.from(paths);
}

export function useDocsList(collectionId: string, options: {orderBy: string}) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const firebase = useFirebase();
  const db = firebase.db;
  // Track the current load to discard stale updates when the collection or
  // sort order changes mid-load.
  const loadIdRef = useRef(0);

  const projectId = window.__ROOT_CTX.rootConfig.projectId || 'default';

  const listDocs = async () => {
    const currentLoadId = ++loadIdRef.current;
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
    } else if (orderBy === 'newest') {
      dbQuery = query(dbCollection, queryOrderby('sys.createdAt', 'desc'));
    } else if (orderBy === 'oldest') {
      dbQuery = query(dbCollection, queryOrderby('sys.createdAt'));
    } else if (orderBy === 'slug') {
      dbQuery = query(dbCollection, queryOrderby(documentId()));
    } else if (orderBy === 'slugDesc') {
      dbQuery = query(dbCollection, queryOrderby(documentId(), 'desc'));
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
      const snapshot = await getDocs(dbQuery);
      if (loadIdRef.current !== currentLoadId) return;

      const snapshotDocs = snapshot.docs;
      const allDocs: any[] = [];

      for (let i = 0; i < snapshotDocs.length; i += BATCH_SIZE) {
        // Process one batch of documents.
        const end = Math.min(i + BATCH_SIZE, snapshotDocs.length);
        for (let j = i; j < end; j++) {
          const d = snapshotDocs[j];
          const data = d.data();
          const slug = d.id;
          const docId = `${collectionId}/${slug}`;
          const docData = {
            ...data,
            id: docId,
            slug: slug,
          };
          allDocs.push(docData);
          setDocToCache(docId, docData);
        }

        // Bail if a newer load was triggered while processing.
        if (loadIdRef.current !== currentLoadId) {
          return;
        }

        // After the first batch, show the table immediately so the UI is
        // interactive while remaining docs stream in.
        setDocs([...allDocs]);
        if (i === 0) {
          setLoading(false);
        }

        // Yield to the browser between batches so the spinner/UI stays
        // responsive and CSS animations don't freeze.
        if (end < snapshotDocs.length) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      // Handle empty collections (the loop body never executes).
      if (snapshotDocs.length === 0) {
        setDocs([]);
      }
    });
    if (loadIdRef.current === currentLoadId) {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    listDocs();
  }, [collectionId, options.orderBy]);

  return [loading, listDocs, docs] as const;
}

/**
 * Like `useDocsList` but fetches only the fields needed for the list view
 * (sys metadata + preview title/image) using the Firestore REST API with
 * a `select` clause. This dramatically reduces payload size for collections
 * with large documents.
 *
 * Also exposes `loadFullDocs()` to fetch complete documents on demand (e.g.
 * when the user triggers a search).
 */
export function useDocsListLightweight(
  collectionId: string,
  options: {orderBy: string}
) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullDocs, setFullDocs] = useState<any[] | null>(null);
  const [fullDocsLoading, setFullDocsLoading] = useState(false);
  const firebase = useFirebase();
  const db = firebase.db;
  const loadIdRef = useRef(0);
  const fullLoadIdRef = useRef(0);

  const projectId = window.__ROOT_CTX.rootConfig.projectId || 'default';

  // Lightweight listing via REST API with field masks.
  const listDocs = async () => {
    const currentLoadId = ++loadIdRef.current;
    setLoading(true);
    setFullDocs(null);

    const selectFields = getPreviewFieldPaths(collectionId);
    const orderByConfig = getRestOrderBy(options.orderBy, collectionId);

    // Ensure the orderBy field is covered by the select.
    if (
      orderByConfig &&
      orderByConfig.field !== '__name__' &&
      !selectFields.some((f) => orderByConfig.field.startsWith(f))
    ) {
      selectFields.push(orderByConfig.field);
    }

    await notifyErrors(async () => {
      const results = await queryDocsWithSelect({
        parentPath: `Projects/${projectId}/Collections/${collectionId}`,
        collectionId: 'Drafts',
        selectFields,
        orderBy: orderByConfig,
      });

      if (loadIdRef.current !== currentLoadId) return;

      setDocs(
        results.map((r) => ({
          ...r.data,
          id: `${collectionId}/${r.slug}`,
          slug: r.slug,
        }))
      );
    });

    if (loadIdRef.current === currentLoadId) {
      setLoading(false);
    }
  };

  // Full fetch via Firebase SDK — for search.
  const loadFullDocs = useCallback(async () => {
    // If already loaded for this collection/ordering, skip.
    if (fullDocs !== null) return fullDocs;

    const currentLoadId = ++fullLoadIdRef.current;
    setFullDocsLoading(true);

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
    } else if (orderBy === 'newest') {
      dbQuery = query(dbCollection, queryOrderby('sys.createdAt', 'desc'));
    } else if (orderBy === 'oldest') {
      dbQuery = query(dbCollection, queryOrderby('sys.createdAt'));
    } else if (orderBy === 'slug') {
      dbQuery = query(dbCollection, queryOrderby(documentId()));
    } else if (orderBy === 'slugDesc') {
      dbQuery = query(dbCollection, queryOrderby(documentId(), 'desc'));
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

    let result: any[] | null = null;
    await notifyErrors(async () => {
      const snapshot = await getDocs(dbQuery);
      if (fullLoadIdRef.current !== currentLoadId) return;

      const allDocs: any[] = [];
      const snapshotDocs = snapshot.docs;

      for (let i = 0; i < snapshotDocs.length; i += BATCH_SIZE) {
        const end = Math.min(i + BATCH_SIZE, snapshotDocs.length);
        for (let j = i; j < end; j++) {
          const d = snapshotDocs[j];
          const data = d.data();
          const slug = d.id;
          const docId = `${collectionId}/${slug}`;
          allDocs.push({...data, id: docId, slug});
          setDocToCache(docId, {...data, id: docId, slug});
        }
        if (fullLoadIdRef.current !== currentLoadId) return;
        if (end < snapshotDocs.length) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      if (fullLoadIdRef.current === currentLoadId) {
        setFullDocs(allDocs);
        result = allDocs;
      }
    });

    if (fullLoadIdRef.current === currentLoadId) {
      setFullDocsLoading(false);
    }
    return result;
  }, [collectionId, options.orderBy, db, projectId, fullDocs]);

  useEffect(() => {
    listDocs();
  }, [collectionId, options.orderBy]);

  return {loading, docs, listDocs, fullDocs, fullDocsLoading, loadFullDocs};
}
