import {Select, SelectItem} from '@mantine/core';
import {Navigate, useNavigate} from 'react-router-dom';
import {useWorkspace} from '../hooks/useWorkspace';
import styles from './ProjectSelectPage.module.sass';

/**
 * Project select page for multi-project workspaces.
 *
 * This page is mounted to the root URL `/cms/` and prompts the user to select a
 * project. If there is only one project in the workspace, the user is
 * automatically re-routed to `/cms/<project>/`.
 */
export function ProjectSelectPage() {
  const workspace = useWorkspace();
  const navigate = useNavigate();

  if (!workspace.projects || workspace.projects.length === 0) {
    return (
      <div className={styles.ProjectSelectPage}>
        <div className={styles.ProjectSelectPage_Title}>No projects.</div>
      </div>
    );
  }

  if (workspace.projects.length === 1) {
    return <Navigate to={`/cms/${workspace.projects[0].id}`} />;
  }

  const projectOptions: SelectItem[] = workspace.projects.map(project => {
    return {
      value: project.id,
      label: `${project.name || project.id} (id: ${project.id})`,
    };
  });
  return (
    <div className={styles.ProjectSelectPage}>
      <div className={styles.ProjectSelectPage_Title}>
        Select a project to continue:
      </div>
      <Select
        placeholder="Projects"
        data={projectOptions}
        onChange={projectId => navigate(`/cms/${projectId}`)}
      />
    </div>
  );
}
