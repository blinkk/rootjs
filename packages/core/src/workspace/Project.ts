import ProjectConfig from '../config/ProjectConfig';

export interface ProjectSerialized {
  id: string;
  name?: string;
  domains?: string[];
}

async function loadConfig(projectDir: string): Promise<ProjectConfig> {
  const configPath = `${projectDir}/${Project.CONFIG_FILE}`;
  return (await import(configPath)).default as ProjectConfig;
}

export class Project {
  static CONFIG_FILE = 'cms.config.ts';

  projectDir: string;
  config: ProjectConfig;
  id: string;

  constructor(projectDir: string, config: ProjectConfig) {
    this.projectDir = projectDir;
    this.config = config;
    this.id = this.config.id;
  }

  static async init(projectDir: string) {
    const config = await loadConfig(projectDir);
    return new Project(projectDir, config);
  }

  serialize(): ProjectSerialized {
    return {
      id: this.id,
      name: this.config.name,
      domains: this.config.domains,
    };
  }
}

export default Project;
