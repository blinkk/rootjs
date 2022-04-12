import {Link} from 'react-router-dom';
import {WebUIShell} from '../../components/WebUIShell/WebUIShell';
import {useProject} from '../../hooks/useProject';
import style from './ProjectPage.module.sass';

export function ProjectPage() {
  const project = useProject();
  return (
    <WebUIShell>
      <div className={style.ProjectPage}>
        <div className={style.ProjectPage_ProjectName}>
          {project.name || project.id}
        </div>

        <div className={style.ProjectPage_CollectionsTitle}>Content Types</div>
        <div className={style.ProjectPage_Collections}>
          {project.collections.map(collection => (
            <div className={style.ProjectPage_Collection} key={collection.id}>
              <Link to={`/cms/${project.id}/content/${collection.id}`}>
                {collection.id}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </WebUIShell>
  );
}
