import fs from 'node:fs';
import path from 'node:path';
import {loadRootConfig} from '@blinkk/root/node';
import {getCmsPlugin} from '../core/client.js';

export interface ExportOptions {
  /** Filter to specific collection types. */
  include?: string;
  /** Site id to export (overrides root config). */
  site?: string;
  /** Firestore database id. */
  database?: string;
  /** GCP project id (overrides root config). */
  project?: string;
}

const COLLECTION_TYPES = [
  'ActionLogs',
  'Collections',
  'DataSources',
  'Releases',
  'Translations',
  'Users',
] as const;

type CollectionType = (typeof COLLECTION_TYPES)[number];

export async function exportData(options: ExportOptions) {
  const rootDir = process.cwd();
  const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
  const cmsPlugin = getCmsPlugin(rootConfig);
  const cmsPluginOptions = cmsPlugin.getConfig();
  const siteId = options.site || cmsPluginOptions.id || 'default';
  const databaseId = options.database || '(default)';
  const db = cmsPlugin.getFirestore({databaseId});

  // Parse includes filter.
  let includes: CollectionType[] = [...COLLECTION_TYPES];
  if (options.include) {
    const requestedIncludes = options.include
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    includes = requestedIncludes.filter((inc) =>
      COLLECTION_TYPES.includes(inc as CollectionType)
    ) as CollectionType[];

    if (includes.length === 0) {
      throw new Error(
        `No valid collection types specified in --include. Valid types: ${COLLECTION_TYPES.join(
          ', '
        )}`
      );
    }
  }

  // Create export directory with timestamp.
  const now = new Date();
  const timestamp = formatTimestamp(now);
  const exportDir = `export_${siteId}_${timestamp}`;
  const gcpProjectId =
    options.project || cmsPluginOptions.firebaseConfig?.projectId || 'unknown';

  // Display export information in table format.
  console.log('');
  console.table({
    Directory: exportDir,
    'GCP Project': gcpProjectId,
    Database: `${databaseId}/Projects/${siteId}`,
    Site: siteId,
    Collections: includes.join(', '),
  });
  console.log('');

  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, {recursive: true});
  }

  // Export each collection type.
  for (const collectionType of includes) {
    console.log(`Exporting ${collectionType}...`);

    if (collectionType === 'Collections') {
      await exportCollections(db, siteId, exportDir);
    } else if (collectionType === 'DataSources') {
      await exportDataSources(db, siteId, exportDir);
    } else if (collectionType === 'Releases') {
      await exportReleases(db, siteId, exportDir);
    } else if (collectionType === 'Translations') {
      await exportTranslations(db, siteId, exportDir);
    } else if (collectionType === 'ActionLogs') {
      await exportActionLogs(db, siteId, exportDir);
    } else if (collectionType === 'Users') {
      await exportUsers(db, siteId, exportDir);
    }
  }

  console.log(`\n✅ Export complete! Data saved to: ${exportDir}`);
}

async function exportCollections(db: any, siteId: string, exportDir: string) {
  const collectionsDir = path.join(exportDir, 'Collections');
  if (!fs.existsSync(collectionsDir)) {
    fs.mkdirSync(collectionsDir, {recursive: true});
  }

  // Get all collection names by listing the Collections directory.
  const collectionsPath = `Projects/${siteId}/Collections`;
  const collectionsSnapshot = await db
    .collection(collectionsPath)
    .listDocuments();

  for (const collectionRef of collectionsSnapshot) {
    const collectionId = collectionRef.id;
    const collectionDir = path.join(collectionsDir, collectionId);

    // Export Drafts.
    const draftsPath = `${collectionsPath}/${collectionId}/Drafts`;
    const draftsSnapshot = await db.collection(draftsPath).get();
    if (!draftsSnapshot.empty) {
      const draftsDir = path.join(collectionDir, 'Drafts');
      if (!fs.existsSync(draftsDir)) {
        fs.mkdirSync(draftsDir, {recursive: true});
      }

      for (const doc of draftsSnapshot.docs) {
        const docData = doc.data();
        const filePath = path.join(draftsDir, `${doc.id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(docData, null, 2));
      }
      console.log(
        `  - ${collectionId}/Drafts: ${draftsSnapshot.size} documents`
      );
    }

    // Export Published.
    const publishedPath = `${collectionsPath}/${collectionId}/Published`;
    const publishedSnapshot = await db.collection(publishedPath).get();
    if (!publishedSnapshot.empty) {
      const publishedDir = path.join(collectionDir, 'Published');
      if (!fs.existsSync(publishedDir)) {
        fs.mkdirSync(publishedDir, {recursive: true});
      }

      for (const doc of publishedSnapshot.docs) {
        const docData = doc.data();
        const filePath = path.join(publishedDir, `${doc.id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(docData, null, 2));
      }
      console.log(
        `  - ${collectionId}/Published: ${publishedSnapshot.size} documents`
      );
    }
  }
}

async function exportDataSources(db: any, siteId: string, exportDir: string) {
  const dataSourcesDir = path.join(exportDir, 'DataSources');
  if (!fs.existsSync(dataSourcesDir)) {
    fs.mkdirSync(dataSourcesDir, {recursive: true});
  }

  const dataSourcesPath = `Projects/${siteId}/DataSources`;
  const snapshot = await db.collection(dataSourcesPath).get();

  for (const doc of snapshot.docs) {
    const dataSourceId = doc.id;
    const dataSourceData = doc.data();
    const dataSourceDir = path.join(dataSourcesDir, dataSourceId);
    if (!fs.existsSync(dataSourceDir)) {
      fs.mkdirSync(dataSourceDir, {recursive: true});
    }

    // Save data source metadata.
    const metadataPath = path.join(dataSourceDir, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(dataSourceData, null, 2));

    // Export draft data if it exists.
    const draftDataPath = `${dataSourcesPath}/${dataSourceId}/Data/draft`;
    const draftDataDoc = await db.doc(draftDataPath).get();
    if (draftDataDoc.exists) {
      const draftFilePath = path.join(dataSourceDir, 'draft.json');
      fs.writeFileSync(
        draftFilePath,
        JSON.stringify(draftDataDoc.data(), null, 2)
      );
    }

    // Export published data if it exists.
    const publishedDataPath = `${dataSourcesPath}/${dataSourceId}/Data/published`;
    const publishedDataDoc = await db.doc(publishedDataPath).get();
    if (publishedDataDoc.exists) {
      const publishedFilePath = path.join(dataSourceDir, 'published.json');
      fs.writeFileSync(
        publishedFilePath,
        JSON.stringify(publishedDataDoc.data(), null, 2)
      );
    }
  }

  console.log(`  - DataSources: ${snapshot.size} data sources`);
}

async function exportReleases(db: any, siteId: string, exportDir: string) {
  const releasesDir = path.join(exportDir, 'Releases');
  if (!fs.existsSync(releasesDir)) {
    fs.mkdirSync(releasesDir, {recursive: true});
  }

  const releasesPath = `Projects/${siteId}/Releases`;
  const snapshot = await db.collection(releasesPath).get();

  for (const doc of snapshot.docs) {
    const releaseData = doc.data();
    const filePath = path.join(releasesDir, `${doc.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(releaseData, null, 2));
  }

  console.log(`  - Releases: ${snapshot.size} documents`);
}

async function exportTranslations(db: any, siteId: string, exportDir: string) {
  const translationsDir = path.join(exportDir, 'Translations');
  if (!fs.existsSync(translationsDir)) {
    fs.mkdirSync(translationsDir, {recursive: true});
  }

  const translationsPath = `Projects/${siteId}/Translations`;
  const snapshot = await db.collection(translationsPath).get();

  for (const doc of snapshot.docs) {
    const translationData = doc.data();
    const filePath = path.join(translationsDir, `${doc.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(translationData, null, 2));
  }

  console.log(`  - Translations: ${snapshot.size} documents`);
}

async function exportActionLogs(db: any, siteId: string, exportDir: string) {
  const actionLogsDir = path.join(exportDir, 'ActionLogs');
  if (!fs.existsSync(actionLogsDir)) {
    fs.mkdirSync(actionLogsDir, {recursive: true});
  }

  const actionLogsPath = `Projects/${siteId}/ActionLogs`;
  const snapshot = await db.collection(actionLogsPath).get();

  for (const doc of snapshot.docs) {
    const actionData = doc.data();
    const filePath = path.join(actionLogsDir, `${doc.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(actionData, null, 2));
  }

  console.log(`  - ActionLogs: ${snapshot.size} documents`);
}

async function exportUsers(db: any, siteId: string, exportDir: string) {
  const usersDir = path.join(exportDir, 'Users');
  if (!fs.existsSync(usersDir)) {
    fs.mkdirSync(usersDir, {recursive: true});
  }

  // Users/roles are stored in the Project document itself.
  const projectPath = `Projects/${siteId}`;
  const projectDoc = await db.doc(projectPath).get();

  if (projectDoc.exists) {
    const projectData = projectDoc.data();
    const filePath = path.join(usersDir, 'project.json');
    fs.writeFileSync(filePath, JSON.stringify(projectData, null, 2));

    const rolesCount = projectData.roles
      ? Object.keys(projectData.roles).length
      : 0;
    console.log(`  - Users: ${rolesCount} users`);
  } else {
    console.log('  - Users: 0 users');
  }
}

function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}t${hour}${minute}`;
}
