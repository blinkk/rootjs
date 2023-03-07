import {useEffect, useState} from 'preact/hooks';
import {useFirebase} from './useFirebase.js';
import {getFirestore, doc, getDoc, updateDoc, setDoc} from 'firebase/firestore';

export function useDoc(docId: string) {
  const [collectionId, slug] = docId.split('/');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({});
  const app = useFirebase();

  useEffect(() => {
    const db = getFirestore(app);
    const project = window.__ROOT_CTX.id;
    const docRef = doc(
      db,
      'Projects',
      project,
      'Collections',
      collectionId,
      'Docs',
      slug
    );
    getDoc(docRef).then((snapshot) => {
      setData(snapshot.data() || {});
      setLoading(false);
    });
  }, []);

  return {loading, data};
}
