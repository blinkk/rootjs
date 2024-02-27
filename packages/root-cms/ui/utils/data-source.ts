import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

export type DataSourceType = 'http' | 'gsheet';

export interface DataSource {
  id: string;
  description?: string;
  type: 'http' | 'gsheet';
  url: string;
  createdAt: Timestamp;
  createdBy: string;
  syncedAt?: Timestamp;
  syncedBy?: string;
  publishedAt?: Timestamp;
  publishedBy?: string;
}

export async function addDataSource(dataSource: DataSource) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, 'DataSources', dataSource.id);
  await setDoc(docRef, {
    ...dataSource,
    createdAt: serverTimestamp(),
    createdBy: window.firebase.user.email,
  });
}

export async function listDataSources(): Promise<DataSource[]> {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const colRef = collection(db, 'Projects', projectId, 'DataSources');
  const q = query(colRef);
  const querySnapshot = await getDocs(q);
  const res: DataSource[] = [];
  querySnapshot.forEach((doc) => {
    res.push(doc.data() as DataSource);
  });
  return res;
}

export async function getDataSource(id: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, 'DataSources', id);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.data() as DataSource;
}

export async function updateDataSource(
  id: string,
  dataSource: Partial<DataSource>
) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, 'DataSources', id);
  await updateDoc(docRef, dataSource);
}

export async function syncDataSource(id: string) {
  await updateDataSource(id, {
    syncedAt: Timestamp.now(),
    syncedBy: window.firebase.user.email!,
  });
}

export async function publishDataSource(id: string) {
  await updateDataSource(id, {
    publishedAt: Timestamp.now(),
    publishedBy: window.firebase.user.email!,
  });
}
