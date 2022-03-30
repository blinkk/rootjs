import {useNotifications} from '@mantine/notifications';
import {useParams} from 'react-router-dom';
import {Collection} from '../lib/Collection';
import {Doc} from '../lib/Doc';
import {useProject} from './useProject';

export function useDoc(docId?: string): Doc {
  const notifications = useNotifications();
  const project = useProject();
  let collectionId: string;
  let slug: string;
  if (docId) {
    [collectionId, slug] = docId.split('/');
  } else {
    const params = useParams();
    collectionId = params.collectionId || '';
    slug = params.slug || '';
    docId = `${collectionId}/${slug}`;
  }
  const collectionConfig = project.collections.find(c => c.id === collectionId);
  if (!collectionConfig) {
    notifications.showNotification({
      title: 'Collection Not Found',
      message: `${collectionId} does not exist`,
      color: 'red',
      autoClose: false,
    });
    throw new Error(`collection not found: ${collectionId}`);
  }
  const collection = new Collection(project, collectionConfig);
  const doc = new Doc(collection, slug);
  return doc;
}
