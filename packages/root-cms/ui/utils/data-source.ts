import {
  Timestamp,
  WriteBatch,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {logAction} from './actions.js';
import {GSpreadsheet, parseSpreadsheetUrl} from './gsheets.js';

export type DataSourceType = 'http' | 'gsheet';

export type HttpMethod = 'GET' | 'POST';

export type GsheetDataFormat = 'array' | 'map';

export interface DataSource {
  id: string;
  description?: string;
  type: 'http' | 'gsheet';
  url: string;
  /**
   * Currently only used by gsheet. `array` returns the sheet as an array of
   * arrays, `map` returns the sheet as an array of objects.
   */
  dataFormat?: GsheetDataFormat;
  /**
   * Options for HTTP requests.
   */
  httpOptions?: {
    method: HttpMethod;
    headers?: Record<string, string>;
    body?: string;
  };
  previewUrl?: string;
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
  /** Optional list of column headers (for gsheet sources). */
  headers?: string[];
}

export async function addDataSource(
  id: string,
  dataSource: Partial<DataSource>
) {
  if (!id) {
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
  logAction('datasource.create', {metadata: {datasourceId: id}});
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
  logAction('datasource.save', {metadata: {datasourceId: id}});
}

export async function syncDataSource(id: string) {
  const dataSource = await getDataSource(id);
  if (!dataSource) {
    throw new Error(`data source not found: ${id}`);
  }

  // To avoid CORS issues, non-relative HTTP fetches are handled on the server.
  // This may change in the future.
  if (
    dataSource.type === 'http' &&
    dataSource.url &&
    !isRelativeUrl(dataSource.url)
  ) {
    const res = await fetch('/cms/api/data.sync', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({id: dataSource.id}),
    });
    if (res.status !== 200) {
      const err = await res.text();
      throw new Error(`sync failed: ${err}`);
    }
  } else {
    const {data, headers} = await fetchData(dataSource);

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

    const batch = writeBatch(db);
    batch.set(dataDocRef, {
      dataSource: updatedDataSource,
      data: data,
      ...(headers ? {headers} : {}),
    });
    batch.update(dataSourceDocRef, {
      syncedAt: Timestamp.now(),
      syncedBy: window.firebase.user.email!,
    });
    await batch.commit();
  }

  console.log(`synced data source: ${id}`);
  logAction('datasource.sync', {metadata: {datasourceId: id}});
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

  const batch = writeBatch(db);
  batch.set(dataDocRefPublished, {
    dataSource: updatedDataSource,
    data: dataRes?.data || null,
    ...(dataRes?.headers ? {headers: dataRes.headers} : {}),
  });
  batch.update(dataDocRefDraft, {
    dataSource: updatedDataSource,
  });
  batch.update(dataSourceDocRef, {
    publishedAt: Timestamp.now(),
    publishedBy: window.firebase.user.email!,
  });
  await batch.commit();

  console.log(`published data ${id}`);
  logAction('datasource.publish', {metadata: {datasourceId: id}});
}

export async function cmsPublishDataSources(
  ids: string[],
  options?: {batch?: WriteBatch; commitBatch?: boolean}
) {
  if (ids.length === 0) {
    return;
  }
  const db = window.firebase.db;
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const batch = options?.batch || writeBatch(db);
  for (const id of ids) {
    const dataSource = await getDataSource(id);
    if (!dataSource) {
      throw new Error(`data source not found: ${id}`);
    }
    const dataRes = await getFromDataSource(id, {mode: 'draft'});
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
    const updatedDataSource = {
      ...dataSource,
      publishedAt: serverTimestamp(),
      publishedBy: window.firebase.user.email!,
    };
    batch.set(dataDocRefPublished, {
      dataSource: updatedDataSource,
      data: dataRes?.data || null,
      ...(dataRes?.headers ? {headers: dataRes.headers} : {}),
    });
    batch.update(dataDocRefDraft, {dataSource: updatedDataSource});
    batch.update(dataSourceDocRef, {
      publishedAt: serverTimestamp(),
      publishedBy: window.firebase.user.email!,
    });
    logAction('datasource.publish', {metadata: {datasourceId: id}});
  }
  if (!options?.batch || options?.commitBatch) {
    await batch.commit();
  }
}

export async function deleteDataSource(id: string) {
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
  const batch = writeBatch(db);
  batch.delete(dataDocRefDraft);
  batch.delete(dataDocRefPublished);
  batch.delete(dataSourceDocRef);
  await batch.commit();
  console.log(`deleted data source ${id}`);
  logAction('datasource.delete', {metadata: {datasourceId: id}});
}

interface FetchedData {
  data: any;
  headers?: string[];
}

async function fetchData(dataSource: DataSource): Promise<FetchedData> {
  if (dataSource.type === 'http') {
    const data = await fetchHttpData(dataSource);
    return {data};
  }
  if (dataSource.type === 'gsheet') {
    return await fetchGsheetData(dataSource);
  }
  throw new Error(`unsupported data source: ${dataSource.type}`);
}

async function fetchGsheetData(dataSource: DataSource): Promise<FetchedData> {
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
  const [headers, rows] = await gsheet.getValues();
  if (dataFormat === 'array') {
    return {data: [headers, rows], headers};
  }
  const mapData = rows.map((row) => {
    const item: Record<string, string> = {};
    row.forEach((val, i) => {
      const key = headers[i];
      if (key) {
        item[key] = String(val || '');
      }
    });
    return item;
  });
  return {data: mapData, headers};
}

async function fetchHttpData(dataSource: DataSource) {
  // Only relative URLs are supported with this method.
  if (!isRelativeUrl(dataSource.url)) {
    throw new Error(`unsupported url: ${dataSource.url}`);
  }

  const res = await fetch(dataSource.url, {
    method: dataSource.httpOptions?.method || 'GET',
    headers: dataSource.httpOptions?.headers || [],
    body: dataSource.httpOptions?.body || undefined,
  });

  if (res.status !== 200) {
    const err = await res.text();
    throw new Error(`req failed: ${err}`);
  }

  const contentType = String(res.headers.get('content-type'));
  if (contentType.includes('application/json')) {
    return await res.json();
  }
  return res.text();
}

function isRelativeUrl(url: string) {
  return url && url.startsWith('/');
}
