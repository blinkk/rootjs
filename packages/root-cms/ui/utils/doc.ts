import {doc, runTransaction, getDoc, serverTimestamp, setDoc} from 'firebase/firestore';

export async function cmsDeleteDoc(docId: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const [collectionId, slug] = docId.split('/');
  const draftDocRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Drafts',
    slug
  );
  const publishedDocRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Published',
    slug
  );
  await runTransaction(db, async (transaction) => {
    // Delete the draft doc.
    transaction.delete(draftDocRef);
    // Delete the published doc.
    transaction.delete(publishedDocRef);
  });
}

export async function cmsUnpublishDoc(docId: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const [collectionId, slug] = docId.split('/');
  const draftDocRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Drafts',
    slug
  );
  const publishedDocRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Published',
    slug
  );
  await runTransaction(db, async (transaction) => {
    const draftDoc = await getDoc(draftDocRef);
    if (!draftDoc.exists()) {
      throw new Error(`${draftDocRef.id} does not exist`);
    }
    const data = {...draftDoc.data()};
    const sys = data.sys ?? {};
    sys.modifiedAt = serverTimestamp();
    sys.modifiedBy = window.firebase.user.email;
    delete sys.publishedAt;
    delete sys.publishedBy;
    delete sys.firstPublishedAt;
    delete sys.firstPublishedBy;

    // Update the "sys" metadata in the draft doc.
    transaction.update(draftDocRef, {sys});
    // Delete the "published" doc.
    transaction.delete(publishedDocRef);
  });
}

export async function cmsCopyDoc(fromDocId: string, toDocId: string) {
  const fromDocRef = getDocRef(fromDocId);
  const fromDoc = await getDoc(fromDocRef);
  if (!fromDoc.exists()) {
    throw new Error(`doc ${fromDocId} does not exist`);
  }
  const fields = fromDoc.data().fields ?? {};
  await cmsCreateDoc(toDocId, {fields});
}

export async function cmsCreateDoc(
  docId: string,
  options?: {fields?: Record<string, any>}
) {
  const [collectionId, slug] = docId.split('/');
  const docRef = getDocRef(docId);
  const doc = await getDoc(docRef);
  if (doc.exists()) {
    throw new Error(`${docId} already exists`);
  }
  const data = {
    id: docId,
    collection: collectionId,
    slug: slug,
    sys: {
      createdAt: serverTimestamp(),
      createdBy: window.firebase.user.email,
      modifiedAt: serverTimestamp(),
      modifiedBy: window.firebase.user.email,
    },
    fields: options?.fields ?? {},
  };
  await setDoc(docRef, data);
}

export function getDocRef(docId: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const [collectionId, slug] = docId.split('/');
  return doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Drafts',
    slug
  );
}
