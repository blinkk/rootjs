/**
 * Document verion history.
 *
 * Verions save the state of a document at different moments in time, allowing
 * users to revert back to a version if/when needed.
 *
 * The saveVersions() function is meant to be run within a cron job (e.g using
 * firebase functions). Every minute, the runner checks for all documents that
 * have been edited since the last run. To avoid saving "partial" versions
 * (when the user might be in the middle of editing a document), versions only
 * run on documents that haven't been edited within the last 5 mins to ensure
 * that version is "stable".
 *
 * In the database, versions are stored as:
 * /Projects/<projectId>/Collections/<collectionId>/Drafts/<docId>/Versions/<timestamp>
 *
 * Where <timestamp> is the unix timestamp (millis) that the document was last
 * edited.
 */

import path from 'node:path';
import {RootConfig} from '@blinkk/root';
import {Firestore, Query, Timestamp} from 'firebase-admin/firestore';
import glob from 'tiny-glob';
import {getCmsPlugin} from './client.js';

// To avoid saving "partial" versions (when the user might be in the middle of
// editing a document), versions only run on documents that haven't been edited
// within the last 5 mins to ensure that version is "stable".
const DOCUMENT_SAVE_OFFSET = 5 * 60 * 1000;

interface PartialCMSDoc {
  [key: string]: any;
  id: string;
  collection: string;
  slug: string;
  sys: {
    modifiedAt: Timestamp;
    modifiedBy: string;
  };
}

export class VersionsService {
  private readonly rootConfig: RootConfig;
  private readonly projectId: string;
  private readonly db: Firestore;

  constructor(rootConfig: RootConfig) {
    this.rootConfig = rootConfig;
    const cmsPlugin = getCmsPlugin(rootConfig);
    const cmsPluginOptions = cmsPlugin.getConfig();
    const projectId = cmsPluginOptions.id || 'default';
    this.projectId = projectId;
    this.db = cmsPlugin.getFirestore();
  }

  /**
   * Saves a version of all documents that have been edited since the last run.
   */
  async saveVersions() {
    // Offset the "last run" time by 5 mins. Versions ignore docs that were
    // edited within the last 5 mins to avoid potential "partial" versions when
    // user is in the middle of editing a document.
    const lastRun = await this.getLastRun();
    const lastRunWithOffset =
      lastRun === 0 ? lastRun : lastRun - DOCUMENT_SAVE_OFFSET;
    const changedDocs = await this.getDocsModifiedAfter(lastRunWithOffset);
    const now = Timestamp.now().toMillis();
    const versions = changedDocs.filter((doc) => {
      const modifiedAt = doc.sys.modifiedAt.toMillis();
      return modifiedAt <= now - DOCUMENT_SAVE_OFFSET;
    });
    if (versions.length > 0) {
      this.saveVersionsToFirestore(versions);
    }
    this.saveLastRun(now);
  }

  private async saveVersionsToFirestore(versions: PartialCMSDoc[]) {
    const batch = this.db.batch();
    versions.forEach((version) => {
      if (!version.collection || !version.slug || !version.sys?.modifiedAt) {
        return;
      }
      const modifiedAtMillis = version.sys.modifiedAt.toMillis();
      const versionPath = `Projects/${this.projectId}/Collections/${version.collection}/Drafts/${version.slug}/Versions/${modifiedAtMillis}`;
      console.log(versionPath);
      const versionRef = this.db.doc(versionPath);
      batch.set(versionRef, version);
    });
    await batch.commit();
    console.log(`versions: saved ${versions.length} versions`);
  }

  /**
   * Returns the last time (in millis) saveVersions() was run, or 0 if has
   * never been run.
   */
  private async getLastRun(): Promise<number> {
    const projectDocRef = this.db.collection('Projects').doc(this.projectId);
    const projectDoc = await projectDocRef.get();
    if (projectDoc.exists) {
      const data = projectDoc.data() || {};
      const ts = data.versionsLastRun as Timestamp;
      if (ts) {
        return ts.toMillis();
      }
    }
    return 0;
  }

  /**
   * Saves {versionLastRun: <timestamp>} to the Projects/<projectId> doc.
   */
  private async saveLastRun(millis: number) {
    const ts = Timestamp.fromMillis(millis);
    const projectDocRef = this.db.collection('Projects').doc(this.projectId);
    await projectDocRef.set({versionsLastRun: ts}, {merge: true});
  }

  /**
   * Returns a list of all docs that were edited after a certain time.
   */
  private async getDocsModifiedAfter(millis: number): Promise<PartialCMSDoc[]> {
    const ts = Timestamp.fromMillis(millis);
    const results: PartialCMSDoc[] = [];
    const collectionIds = await this.listCollections();
    // NOTE: Individual collections are queried instead of using a
    // collectionGroup query because the latter requires a firestore index to be
    // set up.
    for (const collectionId of collectionIds) {
      const collectionPath = `Projects/${this.projectId}/Collections/${collectionId}/Drafts`;
      const query: Query = this.db
        .collection(collectionPath)
        .where('sys.modifiedAt', '>=', ts);
      const querySnapshot = await query.get();
      querySnapshot.forEach((doc) => {
        results.push(doc.data() as PartialCMSDoc);
      });
    }
    return results;
  }

  /**
   * Returns a list of collection ids for the Root project.
   */
  private async listCollections(): Promise<string[]> {
    const collectionIds: string[] = [];
    const collectionFileNames = await glob('*.schema.ts', {
      cwd: path.join(this.rootConfig.rootDir, 'collections'),
    });
    collectionFileNames.forEach((filename) => {
      collectionIds.push(filename.slice(0, -10));
    });
    return collectionIds;
  }
}
