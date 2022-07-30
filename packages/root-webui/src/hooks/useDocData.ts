import {useEffect, useState} from 'react'
import {useDoc} from './useDoc';
import firebase from 'firebase/compat/app';

interface UseDocDataOptions {
  mode?: 'draft' | 'published';
}

export function useDocData(docId: string, options?: UseDocDataOptions) {
  const mode = options?.mode || 'draft';
  const doc = useDoc(docId);
  const [loading, setLoading] = useState(true);
  const [internalMeta, setInternalMeta] = useState<any>({});
  const [internalContent, setInternalContent] = useState<any>({});

  const db = doc.project.db();
  const metaDoc = db.doc(`Projects/${doc.project.id}/Collections/${doc.collection.id}/Docs/${doc.slug}`);
  const contentDoc = db.doc(`Projects/${doc.project.id}/Collections/${doc.collection.id}/Docs/${doc.slug}/Content/${mode}`);

  const onMetaSnapshot = (metaSnapshot: firebase.firestore.DocumentSnapshot) => {
    const metaData = metaSnapshot.data() || {};
    console.log('meta change:', metaData);
    setInternalMeta(metaData[mode] || {});
  };

  const onContentSnapshot = (contentSnapshot: firebase.firestore.DocumentSnapshot) => {
    const contentData = contentSnapshot.data() || {};
    console.log('content change:', contentData);
    setInternalContent(contentData);
  };

  useEffect(() => {
    const metaPromise = metaDoc.get();
    const contentPromise = contentDoc.get()
    Promise.all([metaPromise, contentPromise]).then(([metaSnapshot, contentSnapshot]) => {
      onMetaSnapshot(metaSnapshot);
      onContentSnapshot(contentSnapshot);
      setLoading(false);
    });
    const metaUnsub = metaDoc.onSnapshot((metaSnapshot) => onMetaSnapshot(metaSnapshot));
    const contentUnsub = contentDoc.onSnapshot((contentSnapshot) => onContentSnapshot(contentSnapshot));
    // TODO(stevenle): unsubscribe and re-subscribe on browser visibility change.
    return () => {
      metaUnsub();
      contentUnsub();
    };
  }, [docId]);

  const setMeta = async (meta: any) => {
    setInternalMeta(meta);
    await metaDoc.update({[mode]: meta});
  };

  const setContent = async (content: any) => {
    setInternalContent(content);
    await contentDoc.set(content);
  };

  return {
    loading: loading,
    id: docId,
    slug: doc.slug,
    meta: internalMeta,
    metaDoc: metaDoc,
    setMeta: setMeta,
    content: internalContent,
    contentDoc: contentDoc,
    setContent: setContent,
  };
}
