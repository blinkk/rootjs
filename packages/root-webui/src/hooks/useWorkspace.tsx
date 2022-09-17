import {createContext, useContext, useState} from 'react';
import {Workspace, WorkspaceConfig} from '../lib/Workspace';
import {LoadingPage} from '../pages/LoadingPage/LoadingPage';
import {useJsonRpc} from './useJsonRpc';

export const WorkspaceContext = createContext<Workspace | null>(null);

/**
 * WorkspaceProvider is a context provider that fetches the CMS workspace.
 */
export function WorkspaceProvider({children}: {children: JSX.Element}) {
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  useJsonRpc<WorkspaceConfig>('workspace.json', (workspaceConfig) => {
    const workspace = new Workspace(workspaceConfig);
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
