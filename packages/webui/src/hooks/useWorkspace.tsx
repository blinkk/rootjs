import {createContext, useContext, useState} from 'react';
import {LoadingPage} from '../pages/LoadingPage';
import {useJsonRpc} from './useJsonRpc';

export interface Collection {
  id: string;
}

export interface Project {
  id: string;
  name?: string;
  description?: string;
  collections: Collection[];
}

export interface Workspace {
  projects: Project[];
  firebase: {
    apiKey: string;
    authDomain: string;
  };
}

export const WorkspaceContext = createContext<Workspace | null>(null);

/**
 * WorkspaceProvider is a context provider that fetches the CMS workspace.
 */
export function WorkspaceProvider({children}: {children: JSX.Element}) {
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  useJsonRpc<Workspace>('workspace.json', workspace => {
    console.log(workspace);
    setWorkspace(workspace);
    setLoading(false);
  });

  if (loading) {
    return <LoadingPage />;
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
  return useContext(WorkspaceContext)!;
}
