import {useNotifications} from '@mantine/notifications';
import {useParams} from 'react-router-dom';
import {Project, useWorkspace} from './useWorkspace';

export function useProject(): Project {
  const notifications = useNotifications();
  const workspace = useWorkspace();
  const {projectId} = useParams();
  const project = workspace.projects.find(p => p.id === projectId);
  if (!project) {
    notifications.showNotification({
      title: `Project Not Found`,
      message: `${projectId} does not exist`,
      color: 'red',
      autoClose: false,
    });
    throw new Error(`project not found: ${projectId}`);
  }
  return project;
}
