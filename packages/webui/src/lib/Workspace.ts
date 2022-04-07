import firebase from 'firebase/compat/app';
import {ProjectConfig} from './Project';
import 'firebase/compat/firestore';

export interface WorkspaceConfig {
  projects: ProjectConfig[];
  firebase: {
    apiKey: string;
    authDomain: string;
  };
}

export class Workspace {
  config: WorkspaceConfig;
  projects: ProjectConfig[];
  firebase: firebase.app.App;
  user?: firebase.User;

  constructor(config: WorkspaceConfig) {
    this.config = config;
    console.log(config);
    this.projects = config.projects;
    if (!this.config.firebase) {
      throw new Error('firebase config not found');
    }
    if (firebase.apps.length > 0) {
      // On dev with hmr, use the existing firebase app if it's initialized.
      this.firebase = firebase.app();
    } else {
      const firebaseProject = this.config.firebase.authDomain.split('.')[0];
      this.firebase = firebase.initializeApp({
        projectId: firebaseProject,
        ...this.config.firebase,
      });
    }
  }

  db(): firebase.firestore.Firestore {
    return this.firebase.firestore();
  }

  setUser(user: firebase.User) {
    this.user = user;
  }
}
