import {collection, doc, getDocs, query, setDoc} from 'firebase/firestore';

export type DataSourceType = 'http' | 'gsheet';

export interface DataSource {
  id: string;
  description?: string;
  type: 'http' | 'gsheet';
  url: string;
}

export async function addDataSource(dataSource: DataSource) {
  console.log(dataSource);
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, 'DataSources', dataSource.id);
  await setDoc(docRef, dataSource);
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
