import {useNotifications} from '@mantine/notifications';
import {useParams} from 'react-router-dom';
import {Collection} from '../lib/Collection';
import {useProject} from './useProject';

export function useCollection(collectionId?: string): Collection | null {
  const notifications = useNotifications();
  const project = useProject();
  if (!collectionId) {
    collectionId = useParams().collectionId;
  }
  if (!collectionId) {
    return null;
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
  return collection;
}
