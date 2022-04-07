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
    const contentRef = db.doc(
      `Projects/${this.project.id}/Collections/${this.collection.id}/Docs/${this.slug}/Content/${mode}`
    );
    const snapshot = await contentRef.get();
    return snapshot.data() || {};
  }

  async saveDraft(content: any) {
    const email = this.workspace.user?.email;
    if (!email) {
      throw new Error('no logged in user');
    }

    const db = this.workspace.db();
    const docRef = db.doc(
      `Projects/${this.project.id}/Collections/${this.collection.id}/Docs/${this.slug}`
    );
    const contentRef = db.doc(
      `Projects/${this.project.id}/Collections/${this.collection.id}/Docs/${this.slug}/Content/draft`
    );
    await db.runTransaction(async transaction => {
      transaction.update(docRef, {
        draft: {
          modifiedAt: new Date(),
          modifiedBy: email,
        },
      });
      transaction.set(contentRef, content);
    });
    console.log(`saved ${this.id}`);
    console.log(content);
  }

  async publish(content: any) {
    const email = this.workspace.user?.email;
    if (!email) {
      throw new Error('no logged in user');
    }

    const db = this.workspace.db();
    const docRef = db.doc(
      `Projects/${this.project.id}/Collections/${this.collection.id}/Docs/${this.slug}`
    );
    const contentRef = db.doc(
      `Projects/${this.project.id}/Collections/${this.collection.id}/Docs/${this.slug}/Content/published`
    );
    await db.runTransaction(async transaction => {
      transaction.update(docRef, {
        published: {
          modifiedAt: new Date(),
          modifiedBy: email,
        },
      });
      transaction.set(contentRef, content);
    });
    console.log(`published ${this.id}`);
    console.log(content);
  }
}
