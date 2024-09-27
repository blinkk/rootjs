import {RootConfig} from '@blinkk/root';
import {Timestamp} from 'firebase-admin/firestore';
import {RootCMSClient, Translation, TranslationsDoc} from './client.js';

/**
 * Runs compatibility checks to ensure the current version of root supports
 * any backwards-incompatible db changes.
 *
 * Compatibility versions are stored in the db in Projects/<projectId> under
 * the "compatibility" key. If the compatibility version is less than the
 * latest version, a backwards-friendly "migration" is done to ensure
 * compatibility on both the old and new versions.
 */
export async function runCompatibilityChecks(rootConfig: RootConfig) {
  const cmsClient = new RootCMSClient(rootConfig);
  const projectId = cmsClient.projectId;
  const db = cmsClient.db;
  const projectConfigDocRef = db.doc(`Projects/${projectId}`);
  const projectConfigDoc = await projectConfigDocRef.get();
  const projectConfig = projectConfigDoc.data() || {};

  const compatibilityVersions = projectConfig.compatibility || {};
  let versionsChanged = false;

  const translationsVersion = compatibilityVersions.translations || 0;
  if (translationsVersion < 2) {
    await migrateTranslationsToV2(rootConfig, cmsClient);
    compatibilityVersions.translations = 2;
    versionsChanged = true;
  }

  if (versionsChanged) {
    await projectConfigDocRef.update({compatibility: compatibilityVersions});
    console.log('[root cms] updated db compatibility');
  }
}

/**
 * Migrates translations from the "v1" format to "v2".
 */
async function migrateTranslationsToV2(
  rootConfig: RootConfig,
  cmsClient: RootCMSClient
) {
  if (rootConfig.experiments?.rootCmsDisableTranslationsToV2Check) {
    return;
  }

  const projectId = cmsClient.projectId;
  const db = cmsClient.db;
  const dbPath = `Projects/${projectId}/Translations`;
  const query = db.collection(dbPath);
  const querySnapshot = await query.get();
  if (querySnapshot.size === 0) {
    return;
  }

  console.log('[root cms] updating translations v2 compatibility');

  const translationsDocs: Record<string, TranslationsDoc> = {};
  querySnapshot.forEach((doc) => {
    const hash = doc.id;
    const translation = doc.data() as Translation;
    const tags = translation.tags || [];
    delete translation.tags;
    for (const tag of tags) {
      if (tag.includes('/')) {
        const translationsId = tag;
        translationsDocs[translationsId] ??= {
          id: translationsId,
          sys: {
            modifiedAt: Timestamp.now(),
            modifiedBy: 'root-cms-client',
            publishedAt: Timestamp.now(),
            publishedBy: 'root-cms-client',
          },
          strings: {},
        };
        translationsDocs[translationsId].strings[hash] = translation;
      }
    }
  });

  if (Object.keys(translationsDocs).length === 0) {
    console.log('[root cms] no translations to save');
    return;
  }

  // Move the doc's "l10nSheet" to the translations doc's "linkedSheet".

  for (const docId in translationsDocs) {
    const [collection, slug] = docId.split('/');
    if (collection && slug) {
      const doc: any = await cmsClient.getDoc(collection, slug, {
        mode: 'draft',
      });
      const linkedSheet = doc?.sys?.l10nSheet;
      if (linkedSheet) {
        translationsDocs[docId].sys.linkedSheet = linkedSheet;
      }
    }
  }

  const batch = db.batch();
  Object.entries(translationsDocs).forEach(([translationsId, data]) => {
    const draftRef = db.doc(
      `Projects/${projectId}/TranslationsManager/draft/Translations/${translationsId}`
    );
    const publishedRef = db.doc(
      `Projects/${projectId}/TranslationsManager/published/Translations/${translationsId}`
    );
    batch.set(draftRef, data, {merge: true});
    batch.set(publishedRef, data, {merge: true});
    const len = Object.keys(data.strings).length;
    console.log(`[root cms] saving ${len} string(s) to ${translationsId}...`);
  });
  await batch.commit();

  console.log('[root cms] done migrating translations to v2');
}
