import {promise as glob} from 'glob-promise';
import {loadConfigPath} from '../config/loadConfigFile';
import {ProjectConfig} from '../config/ProjectConfig';
import {Collection, CollectionSerialized} from './Collection';
import firebase from 'firebase-admin';
import {applicationDefault} from 'firebase-admin/app';
import {User} from '../server/types';

const APP_ID = 'rootjs';

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

  /**
   * Returns the Firebase admin app for the project.
   */
  app() {
    let app = firebase.apps.find(app => app?.name === APP_ID);
    if (app) {
      return app;
    }
    app = firebase.initializeApp(
      {
        projectId: this.config.gcpProjectId,
        credential: applicationDefault(),
      },
      APP_ID
    );
    return app;
  }

  /**
   * Returns whether the user is authorized to view the project.
   */
  async isAuthorized(user: User) {
    const email = user.email_verified && user.email;
    if (!email) {
      return false;
    }

    // TODO(stevenle): impl this logic.
    return true;
  }

  /**
   * Returns an object representation that can be JSON serialized.
   */
  serialize(): ProjectSerialized {
    return {
      id: this.id,
      name: this.config.name,
      domains: this.config.domains,
      collections: this.collections.map(c => c.serialize()),
    };
  }
}
