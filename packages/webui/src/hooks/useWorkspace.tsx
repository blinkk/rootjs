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

/**
 * WorkspaceProvider is a context provider that fetches the CMS workspace.
 */
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

/**
 * useWorkspace is a hook that provides the CMS workspace.
 *
 * To use this hook, the `{@link WorkspaceProvider}` must be mounted somewhere
 * higher up in the component tree.
 *
 * For example, in your `App.tsx` file:
 *
 * ```tsx
 * <WorkspaceProvider>
 *   <ExampleComponent />
 * </WorkspaceProvider>
 * ```
 *
 * ```tsx
 * function ExampleComponent(props) {
 *   const workspace = useWorkspace();
 *   return <>{workspace.projects.length}</>;
 * }
 * ```
 */
export function useWorkspace() {
  return useContext(WorkspaceContext);
}
