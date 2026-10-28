import {useCallback, useEffect, useState} from 'preact/hooks';
import {Collection} from '../../../core/schema.js';
import {SSEEvent, SSESchemaChangedEvent, useSSE} from '../../hooks/useSSE.js';
import {showNotification} from '../../primitives/Toast/toastStore.js';
import {fetchCollectionSchema} from './collection.js';

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

  useSSE(SSEEvent.SCHEMA_CHANGED, async (event: SSESchemaChangedEvent) => {
    await fetchSchema();
    const message = event.file
      ? `Applied updates from changes to ${event.file}.`
      : 'Applied updates from changes to a .schema.ts file.';
    showNotification({
      title: 'Updated schema!',
      message: message,
    });
  });

  return {loading, schema};
}
