import React, {createContext, useContext, useEffect, useState} from 'react';
import {Project, ProjectConfig} from '../lib/Project';
import {useJsonRpc} from './useJsonRpc';
import {LoadingPage} from '../pages/LoadingPage/LoadingPage';
import {UserSignInPage} from '../pages/UserSignInPage/UserSignInPage';
import {useFirebase} from './useFirebase';

export const ProjectContext = createContext<Project | null>(null);

export function ProjectProvider({children}: {children?: React.ReactElement}) {
  const app = useFirebase();
  const rpc = useJsonRpc();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [user, setUser] = useState(app.auth().currentUser);

  async function fetchProject() {
    try {
      const projectConfig = await rpc.fetch<ProjectConfig>('project.get');
      const project = new Project(app, projectConfig);
      setProject(project);
    } catch (e) {
      console.error(e);
      setError(true);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (user) {
      fetchProject();
    }
  }, [user]);

  if (!user) {
    return <UserSignInPage onChange={setUser} />;
  }
  if (loading) {
    return <LoadingPage />;
  }
  if (error) {
    return <div>error</div>;
  }
  return (
    <ProjectContext.Provider value={project}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): Project {
  const project = useContext(ProjectContext);
  if (!project) {
    throw new Error('useProject() should be called within a <ProjectProvider>');
  }
  return project;
}
