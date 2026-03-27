/**
 * Lightweight Firestore REST API client for running queries with field masks
 * (select clauses). This avoids downloading full document data when only a
 * subset of fields is needed — e.g. listing 1000+ docs where each has dozens
 * of content blocks but the list only needs sys metadata and a preview title.
 */

/**
 * Mimics the Firestore SDK `Timestamp` interface so code that calls
 * `.toMillis()` works identically with REST-fetched documents.
 */
class RestTimestamp {
  private _ms: number;
  constructor(isoString: string) {
    this._ms = new Date(isoString).getTime();
  }
  toMillis(): number {
    return this._ms;
  }
  toDate(): Date {
    return new Date(this._ms);
  }
}

function decodeValue(value: any): any {
  if (value === undefined || value === null) {
    return null;
  }
  if ('nullValue' in value) {
    return null;
  }
  if ('stringValue' in value) {
    return value.stringValue;
  }
  if ('integerValue' in value) {
    return Number(value.integerValue);
  }
  if ('doubleValue' in value) {
    return value.doubleValue;
  }
  if ('booleanValue' in value) {
    return value.booleanValue;
  }
  if ('timestampValue' in value) {
    return new RestTimestamp(value.timestampValue);
  }
  if ('arrayValue' in value) {
    return (value.arrayValue.values || []).map(decodeValue);
  }
  if ('mapValue' in value) {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value.mapValue.fields || {})) {
      result[k] = decodeValue(v);
    }
    return result;
  }
  if ('referenceValue' in value) {
    return value.referenceValue;
  }
  if ('geoPointValue' in value) {
    return value.geoPointValue;
  }
  if ('bytesValue' in value) {
    return value.bytesValue;
  }
  return undefined;
}

function decodeFields(fields: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = decodeValue(value);
  }
  return result;
}

export interface QueryWithSelectOptions {
  /** Parent document path, e.g. "Projects/default/Collections/BigSandbox". */
  parentPath: string;
  /** Subcollection to query, e.g. "Drafts". */
  collectionId: string;
  /** Firestore field paths to include in the response. */
  selectFields: string[];
  /** Optional ordering. */
  orderBy?: {
    field: string;
    direction: 'ASCENDING' | 'DESCENDING';
  };
}

/**
 * Runs a Firestore structured query via the REST API with a `select` clause
 * so only the requested fields are returned. This can dramatically reduce
 * payload size when documents are large.
 */
export async function queryDocsWithSelect(
  options: QueryWithSelectOptions
): Promise<Array<{slug: string; data: Record<string, any>}>> {
  const firebaseConfig = window.__ROOT_CTX.firebaseConfig as Record<
    string,
    string
  >;
  const firebaseProjectId = firebaseConfig.projectId;
  const databaseId = firebaseConfig.databaseId || '(default)';
  const token = await window.firebase.user.getIdToken();

  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    firebaseProjectId
  )}/databases/${encodeURIComponent(databaseId)}/documents/${
    options.parentPath
  }:runQuery`;

  const structuredQuery: Record<string, any> = {
    from: [{collectionId: options.collectionId}],
    select: {
      fields: options.selectFields.map((f) => ({fieldPath: f})),
    },
  };

  if (options.orderBy) {
    structuredQuery.orderBy = [
      {
        field: {fieldPath: options.orderBy.field},
        direction: options.orderBy.direction,
      },
    ];
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({structuredQuery}),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Firestore REST query failed (${response.status}): ${text}`
    );
  }

  const results: any[] = await response.json();
  return results
    .filter((r) => r.document)
    .map((r) => {
      const doc = r.document;
      const nameParts: string[] = doc.name.split('/');
      const slug = nameParts[nameParts.length - 1];
      return {slug, data: decodeFields(doc.fields || {})};
    });
}
