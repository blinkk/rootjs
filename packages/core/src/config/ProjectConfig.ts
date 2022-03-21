export interface ProjectConfig {
  /**
   * ID for the project.
   */
  id: string;
  /**
   * A descriptive name for the project.
   */
  name?: string;
  /**
   * Any domains the project is mapped to. This configuration is used by the
   * webui: if a workspace has multiple projects and a user visits a domain
   * like https://<project>.com/cms/, the webui will automatically show only the
   * collections for that project.
   */
  domains?: string[];
}

export default ProjectConfig;
