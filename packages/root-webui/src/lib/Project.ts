import {CollectionConfig} from './Collection';
import {Workspace} from './Workspace';

export interface ProjectConfig {
  id: string;
  name?: string;
  description?: string;
  collections: CollectionConfig[];
}

export class Project {
  readonly workspace: Workspace;
  readonly config: ProjectConfig;
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly collections: CollectionConfig[];

  constructor(workspace: Workspace, config: ProjectConfig) {
    this.workspace = workspace;
    this.config = config;
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.collections = config.collections;
  }

  async getRoles(): Promise<Record<string, string>> {
    return {};
  }
}
