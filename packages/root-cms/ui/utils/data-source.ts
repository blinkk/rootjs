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

export interface DataSourceData<T = any> {
  dataSource: DataSource;
  data: T;
}

export async function addDataSource(
  id: string,
  dataSource: Partial<DataSource>
) {
  if (id) {
    throw new Error('missing data source id');
  }
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, 'DataSources', id);
  await setDoc(docRef, {
    ...dataSource,
    id: id,
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

/**
 * Retrieves data source configuration object.
 */
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

/**
 * Retrieves data synced from a data source.
 */
export async function getFromDataSource<T = any>(
  id: string,
  options?: {mode?: 'draft' | 'published'}
): Promise<DataSourceData<T> | null> {
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
    return snapshot.data() as DataSourceData<T>;
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

  console.log(`synced data ${id}`);
}

export async function publishDataSource(id: string) {
  const dataSource = await getDataSource(id);
  if (!dataSource) {
    throw new Error(`data source not found: ${id}`);
  }

  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const dataSourceDocRef = doc(db, 'Projects', projectId, 'DataSources', id);
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

  const dataRes = await getFromDataSource(id, {mode: 'draft'});

  const updatedDataSource: DataSource = {
    ...dataSource,
    publishedAt: Timestamp.now(),
    publishedBy: window.firebase.user.email!,
  };

  await runTransaction(db, async (transaction) => {
    transaction.set(dataDocRefPublished, {
      dataSource: updatedDataSource,
      data: dataRes?.data || null,
    });
    transaction.update(dataDocRefDraft, {
      dataSource: updatedDataSource,
    });
    transaction.update(dataSourceDocRef, {
      publishedAt: Timestamp.now(),
      publishedBy: window.firebase.user.email!,
    });
  });

  console.log(`published data ${id}`);
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
