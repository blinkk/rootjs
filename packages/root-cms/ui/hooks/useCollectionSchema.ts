import {showNotification} from '@mantine/notifications';
import {useCallback, useEffect, useState} from 'preact/hooks';
import {Collection} from '../../core/schema.js';
import {fetchCollectionSchema} from '../utils/collection.js';

export function useCollectionSchema(collectionId: string) {
  const [loading, setLoading] = useState(true);
  const [schema, setSchema] = useState<Collection | null>(null);

  const fetchSchema = useCallback(async () => {
    try {
      const schema = await fetchCollectionSchema(collectionId);
      setSchema(schema);
    } catch (err) {
      console.error(err);
      showNotification({
        title: `Failed to load collection: ${collectionId}`,
        message: String(err),
        color: 'red',
        autoClose: false,
      });
    }
    setLoading(false);
  }, [collectionId]);

  useEffect(() => {
    fetchSchema();
  }, [collectionId]);

  // Connect to server-sent events (SSE) and listen for schema changes.
  useEffect(() => {
    const eventSource = new EventSource('/cms/api/sse.connect');
    eventSource.onmessage = (event) => {
      const data = maybeParseJson(event?.data);
      console.log('sse:', data);
      if (data?.event === 'schema-changed') {
        fetchSchema();
      }
    };
    eventSource.onerror = (event) => {
      console.error('SSE error:', event);
    };
    eventSource.onopen = (event) => {
      console.log('SSE connection opened');
    };
  }, []);

  return {loading, schema};
}

function maybeParseJson(s: string) {
  try {
    return JSON.parse(s);
  } catch (err) {
    return null;
  }
}
