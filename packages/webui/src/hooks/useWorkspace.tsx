import {Loader} from '@mantine/core';
import {createContext, useContext, useEffect, useState} from 'react';
import {rpc} from '../utils/rpc';

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

export function WorkspaceProvider({children}: any) {
  const [loading, setLoading] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace>({projects: []});
  useEffect(() => {
    async function getPodData() {
      const workspace = await rpc<Workspace>('workspace.json');
      setWorkspace(workspace);
      setLoading(false);
    }
    getPodData();
  }, []);
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
