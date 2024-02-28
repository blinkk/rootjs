import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {GSpreadsheet, parseSpreadsheetUrl} from './gsheets.js';

export type DataSourceType = 'http' | 'gsheet';

export interface DataSource {
  id: string;
  description?: string;
  type: 'http' | 'gsheet';
  url: string;
  /**
   * Currently only used by gsheet. `array` returns the sheet as an array of
   * arrays, `map` returns the sheet as an array of objects.
   */
  dataFormat?: 'array' | 'map';
  createdAt: Timestamp;
  createdBy: string;
  syncedAt?: Timestamp;
  syncedBy?: string;
  publishedAt?: Timestamp;
  publishedBy?: string;
}

export interface Data<T = any> {
  dataSource: DataSource;
  data: T;
}

export async function addDataSource(
  dataSource: Omit<DataSource, 'createdAt' | 'createdBy'>
) {
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

export async function getData<T = any>(
  id: string,
  options?: {mode?: 'draft' | 'published'}
): Promise<T | null> {
  const mode = options?.mode || 'draft';
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const dataDocRef = doc(
    db,
    'Projects',
    projectId,
    'DataSources',
    id,
    'Data',
    mode
  );
  const snapshot = await getDoc(dataDocRef);
  if (snapshot.exists()) {
    return snapshot.data() as T;
  }
  return null;
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
  const dataSource = await getDataSource(id);
  if (!dataSource) {
    throw new Error(`data source not found: ${id}`);
  }

  const data = await fetchData(dataSource);

  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;

  const dataSourceDocRef = doc(db, 'Projects', projectId, 'DataSources', id);
  const dataDocRef = doc(
    db,
    'Projects',
    projectId,
    'DataSources',
    id,
    'Data',
    'draft'
  );

  const updatedDataSource: DataSource = {
    ...dataSource,
    syncedAt: Timestamp.now(),
    syncedBy: window.firebase.user.email!,
  };

  await runTransaction(db, async (transaction) => {
    transaction.set(dataDocRef, {
      dataSource: updatedDataSource,
      data: data,
    });
    transaction.update(dataSourceDocRef, {
      syncedAt: Timestamp.now(),
      syncedBy: window.firebase.user.email!,
    });
  });
}

export async function publishDataSource(id: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const dataDocRefDraft = doc(
    db,
    'Projects',
    projectId,
    'DataSources',
    id,
    'Data',
    'draft'
  );
  const dataDocRefPublished = doc(
    db,
    'Projects',
    projectId,
    'DataSources',
    id,
    'Data',
    'published'
  );

  await updateDataSource(id, {
    publishedAt: Timestamp.now(),
    publishedBy: window.firebase.user.email!,
  });
}

async function fetchData(dataSource: DataSource) {
  if (dataSource.type === 'gsheet') {
    return await fetchGsheetData(dataSource);
  }
  throw new Error(`unsupported data source: ${dataSource.type}`);
}

async function fetchGsheetData(dataSource: DataSource) {
  const gsheetId = parseSpreadsheetUrl(dataSource.url);
  if (!gsheetId?.spreadsheetId) {
    throw new Error(`failed to parse google sheet url: ${dataSource.url}`);
  }

  const gspreadsheet = new GSpreadsheet(gsheetId.spreadsheetId);
  const gsheet = await gspreadsheet.getSheet(gsheetId.gid ?? 0);
  if (!gsheet) {
    throw new Error(`could not find sheet: ${dataSource.url}`);
  }

  const dataFormat = dataSource.dataFormat || 'map';
  if (dataFormat === 'array') {
    return await gsheet.getValues();
  }
  return await gsheet.getValuesMap();
}
