import 'firebase/compat/firestore';
import {Project} from './Project';

export interface CollectionConfig {
  id: string;
  description?: string;
}

export class Collection {
  project: Project;
  config: CollectionConfig;
  id: string;
  description?: string;

  constructor(project: Project, config: CollectionConfig) {
    this.project = project;
    this.config = config;
    this.id = config.id;
    this.description = config.description;
  }

  async listDocs(): Promise<any[]> {
    const db = this.project.db();
    const docsRef = db.collection(
      `Projects/${this.project.id}/Collections/${this.id}/Docs`
    );
    const snapshot = await docsRef.orderBy('draft.modifiedAt', 'desc').get();
    return snapshot.docs.map((doc) => ({...doc.data(), slug: doc.id}));
  }

  async getRoles(): Promise<Record<string, string>> {
    const db = this.project.db();
    const docRef = db.doc(`Projects/${this.project.id}/Collections/${this.id}`);
    const snapshot = await docRef.get();
    return snapshot?.data()?.roles || {};
  }
}
