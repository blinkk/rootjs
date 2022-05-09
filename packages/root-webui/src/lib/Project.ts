import firebase from 'firebase/compat/app';
import {CollectionConfig} from './Collection';

export interface ProjectConfig {
  id: string;
  name?: string;
  description?: string;
  collections: CollectionConfig[];
}

export class Project {
  readonly app: firebase.app.App;
  readonly config: ProjectConfig;
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly collections: CollectionConfig[];

  constructor(app: firebase.app.App, config: ProjectConfig) {
    this.app = app;
    this.config = config;
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.collections = config.collections;
  }

  async getRoles(): Promise<Record<string, string>> {
    return {};
  }

  db() {
    return this.app.firestore();
  }
}
