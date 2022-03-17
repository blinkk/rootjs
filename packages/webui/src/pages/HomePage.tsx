import {Select, SelectItem} from '@mantine/core';
import {Navigate, useNavigate} from 'react-router-dom';
import useWorkspace from '../hooks/useWorkspace';
import styles from './HomePage.module.sass';

export function HomePage() {
  const workspace = useWorkspace();
  const navigate = useNavigate();

  if (!workspace.projects || workspace.projects.length === 0) {
    return (
      <div className={styles.HomePage}>
        <div className={styles.HomePage_Title}>No projects.</div>
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
    <div className={styles.HomePage}>
      <div className={styles.HomePage_Title}>Select a project to continue:</div>
      <Select
        placeholder="Projects"
        data={projectOptions}
        onChange={projectId => navigate(`/cms/${projectId}`)}
      />
    </div>
  );
}
