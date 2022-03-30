import {useNotifications} from '@mantine/notifications';
import {useParams} from 'react-router-dom';
import {Project} from '../lib/Project';
import {useWorkspace} from './useWorkspace';

export function useProject(projectId?: string): Project {
  const notifications = useNotifications();
  const workspace = useWorkspace();
  if (!projectId) {
    projectId = useParams().projectId;
  }
  const projectConfig = workspace.projects.find(p => p.id === projectId);
  if (!projectConfig) {
    notifications.showNotification({
      title: 'Project Not Found',
      message: `${projectId} does not exist`,
      color: 'red',
      autoClose: false,
    });
    throw new Error(`project not found: ${projectId}`);
  }
  const project = new Project(workspace, projectConfig);
  return project;
}
