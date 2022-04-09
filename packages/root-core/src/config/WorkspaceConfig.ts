/**
 * Interface for the workspace configuration file.
 */
export interface WorkspaceConfig {
  /**
   * A list of globs where projects reside relative to the workspace.
   */
  projects?: string[];
}

/**
 * Helper function for defining a workspace config with type checking.
 */
export function defineWorkspace(config: WorkspaceConfig): WorkspaceConfig {
  return config;
}
