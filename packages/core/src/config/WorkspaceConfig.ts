/**
 * Interface for the workspace configuration file.
 */
export interface WorkspaceConfig {
  /**
   * A list of globs where projects reside relative to the workspace.
   */
  projects?: string[];
}

export default WorkspaceConfig;
