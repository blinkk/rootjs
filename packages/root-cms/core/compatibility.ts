import {RootConfig} from '@blinkk/root';
import {FieldValue} from 'firebase-admin/firestore';
import type {CMSPlugin} from './plugin.js';

export async function runCompatibilityChecks(
  rootConfig: RootConfig,
  cmsPlugin: CMSPlugin
) {
  console.log('[root cms] running v2 compatibility checks');
  await migrateTranslationsToV2(rootConfig, cmsPlugin);
}

/**
 * Migrates translations from the "v1" format to "v2".
 */
async function migrateTranslationsToV2(
  rootConfig: RootConfig,
  cmsPlugin: CMSPlugin
) {
  if (rootConfig.experiments?.rootCmsDisableTranslationsToV2Check) {
    return;
  }

  const projectId = cmsPlugin.getConfig().id || 'default';
  const db = cmsPlugin.getFirestore();
  const dbPath = `Projects/${projectId}/Translations`;
  const query = db.collection(dbPath);
  const querySnapshot = await query.get();
  if (querySnapshot.size === 0) {
    return;
  }

  console.log('[root cms] migrating Translations to TranslationsMemory');
  const translationsMemories: Record<string, Record<string, any>> = {};
  querySnapshot.forEach((doc) => {
    const hash = doc.id;
    const translation = doc.data();
    const tags = translation.tags || [];
    delete translation.tags;
    for (const tag of tags) {
      if (tag.includes('/')) {
        const translationsMemoryId = tag.replaceAll('/', '--');
        translationsMemories[translationsMemoryId] ??= {};
        translationsMemories[translationsMemoryId][hash] = translation;
      }
    }
  });

  const batch = db.batch();
  Object.entries(translationsMemories).forEach(
    ([translationsMemoryId, strings]) => {
      const updates = {
        sys: {
          modifiedAt: FieldValue.serverTimestamp(),
          modifiedBy: 'root-cms-client',
        },
        strings: strings,
      };
      const draftRef = db.doc(
        `Projects/${projectId}/TranslationsMemory/draft/Translations/${translationsMemoryId}`
      );
      const publishedRef = db.doc(
        `Projects/${projectId}/TranslationsMemory/published/Translations/${translationsMemoryId}`
      );
      batch.set(draftRef, updates, {merge: true});
      batch.set(publishedRef, updates, {merge: true});
      const len = Object.keys(strings).length;
      console.log(
        `[root cms] saving ${len} string(s) to ${translationsMemoryId}...`
      );
    }
  );
  await batch.commit();
  console.log('[root cms] done migrating translations to v2');
}
