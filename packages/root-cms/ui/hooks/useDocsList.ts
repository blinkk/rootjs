import {
  collection,
  getDocs,
  orderBy as queryOrderby,
  Query,
  query,
  documentId,
} from 'firebase/firestore';
import {useEffect, useState} from 'preact/hooks';
import {useFirebase} from './useFirebase.js';

export function useDocsList(collectionId: string, options: {orderBy: string}) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const firebase = useFirebase();
  const db = firebase.db;

  const projectId = window.__ROOT_CTX.rootConfig.projectId || 'default';

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
    } else if (orderBy === 'newest') {
      dbQuery = query(dbCollection, queryOrderby('sys.createdAt', 'desc'));
    } else if (orderBy === 'oldest') {
      dbQuery = query(dbCollection, queryOrderby('sys.createdAt'));
    } else if (orderBy === 'slug') {
      dbQuery = query(dbCollection, queryOrderby(documentId()));
    }
    const snapshot = await getDocs(dbQuery);
    const docs = snapshot.docs.map((d) => ({
      ...d.data(),
      id: `${collectionId}/${d.id}`,
      slug: d.id,
    }));
    setDocs(docs);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    listDocs();
  }, [collectionId, options.orderBy]);

  return [loading, listDocs, docs] as const;
}
