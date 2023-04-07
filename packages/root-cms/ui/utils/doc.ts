import {
  doc,
  runTransaction,
  getDoc,
  deleteField,
  serverTimestamp,
} from 'firebase/firestore';

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
