import {promise as glob} from 'glob-promise';
import {loadConfigPath} from '../config/loadConfigFile';
import {ProjectConfig} from '../config/ProjectConfig';
import {Collection, CollectionSerialized} from './Collection';

export interface ProjectSerialized {
  id: string;
  name?: string;
  domains?: string[];
  collections?: CollectionSerialized[];
}

async function loadCollections(projectDir: string): Promise<Collection[]> {
  const collections: Collection[] = [];
  const configFiles = await glob(`${projectDir}/collections/*.ts`);
  for (const configFile of configFiles) {
    const collection = await Collection.init(configFile);
    collections.push(collection);
  }
  return collections;
}

export class Project {
  static CONFIG_FILE = 'root.config.ts';

  projectDir: string;
  config: ProjectConfig;
  id: string;
  collections: Collection[] = [];

  constructor(projectDir: string, config: ProjectConfig) {
    this.projectDir = projectDir;
    this.config = config;
    this.id = this.config.id;
  }

  static async init(projectDir: string) {
    const config = await loadConfigPath<ProjectConfig>(
      `${projectDir}/${Project.CONFIG_FILE}`
    );
    const project = new Project(projectDir, config);
    project.collections = await loadCollections(projectDir);
    return project;
  }

  serialize(): ProjectSerialized {
    return {
      id: this.id,
      name: this.config.name,
      domains: this.config.domains,
      collections: this.collections.map(c => c.serialize()),
    };
  }
}

export default Project;
