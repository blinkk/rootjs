import {Collection} from './Collection';
import {Project} from './Project';
import {Workspace} from './Workspace';

export class Doc {
  readonly workspace: Workspace;
  readonly project: Project;
  readonly collection: Collection;
  readonly slug: string;
  readonly id: string;

  constructor(collection: Collection, slug: string) {
    this.workspace = collection.project.workspace;
    this.project = collection.project;
    this.collection = collection;
    this.slug = slug;
    this.id = `${collection.id}/${slug}`;
  }

  async getContent(options?: {mode?: 'draft' | 'published'}): Promise<any> {
    const mode = options?.mode || 'draft';
    const db = this.workspace.db();
    const docRef = db.doc(
      `Projects/${this.project.id}/Collections/${this.collection.id}/Docs/${this.slug}/Content/${mode}`
    );
    const snapshot = await docRef.get();
    return snapshot.data() || {};
  }
}
