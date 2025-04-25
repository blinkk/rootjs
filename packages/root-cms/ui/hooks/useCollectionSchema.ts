import {showNotification} from '@mantine/notifications';
import {useCallback, useEffect, useState} from 'preact/hooks';
import {Schema} from '../../core/schema.js';
import {fetchCollectionSchema} from '../utils/collection.js';

export function useCollectionSchema(collectionId: string) {
  const [loading, setLoading] = useState(true);
  const [schema, setSchema] = useState<Schema | null>(null);

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

  return {loading, schema};
}
