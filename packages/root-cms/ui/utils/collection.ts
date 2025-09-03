import {Collection, fromSchemaMap} from '../../core/schema.js';

export async function fetchCollectionSchema(
  collectionId: string
): Promise<Collection> {
  const meta = window.__ROOT_CTX.collections[collectionId];
  if (!meta) {
    throw new Error(`collection not found: ${collectionId}`);
  }
  const res = await window.fetch('/cms/api/collection.get', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({collectionId}),
  });
  if (res.status !== 200) {
    const errorText = await res.text();
    throw new Error(errorText);
  }
  const resData = (await res.json()).data;
  const {collection, schemaMap} = resData;
  return fromSchemaMap(collection, schemaMap) as Collection;
}
