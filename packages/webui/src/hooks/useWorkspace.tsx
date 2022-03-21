import {Loader} from '@mantine/core';
import {createContext, useContext, useState} from 'react';
import {useJsonRpc} from './useJsonRpc';

interface Collection {
  id: string;
}

interface Project {
  id: string;
  name?: string;
  description?: string;
  collections: Collection[];
}

export interface Workspace {
  projects: Project[];
}

export const WorkspaceContext = createContext<Workspace>({projects: []});

export function WorkspaceProvider({children}: {children: JSX.Element}) {
  const [loading, setLoading] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace>({projects: []});
  useJsonRpc<Workspace>('workspace.json', workspace => {
    setWorkspace(workspace);
    setLoading(false);
  });
  if (loading) {
    return <Loader />;
  }
  return (
    <WorkspaceContext.Provider value={workspace}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

export default useWorkspace;
