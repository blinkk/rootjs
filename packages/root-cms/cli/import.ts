import fs from 'node:fs';
import path from 'node:path';
import * as readline from 'node:readline';
import {loadRootConfig} from '@blinkk/root/node';
import {getCmsPlugin} from '../core/client.js';

export interface ImportOptions {
  /** Directory to import from. */
  dir?: string;
  /** Filter to specific collection types. */
  include?: string;
  /** Site id to import to (overrides root config). */
  site?: string;
  /** Firestore database id. */
  database?: string;
  /** GCP project id (overrides root config). */
  project?: string;
}

interface ImportSummary {
  collectionType: string;
  count: number;
  details?: string;
}

export async function importData(options: ImportOptions) {
  if (!options.dir) {
    throw new Error(
      'Error: --dir flag is required. Usage: root-cms import --dir=export_siteId_timestamp'
    );
  }

  const importDir = options.dir;

  if (!fs.existsSync(importDir)) {
    throw new Error(`Error: Directory not found: ${importDir}`);
  }

  const rootDir = process.cwd();
  const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
  const cmsPlugin = getCmsPlugin(rootConfig);
  const cmsPluginOptions = cmsPlugin.getConfig();
  const siteId = options.site || cmsPluginOptions.id || 'default';
  const databaseId = options.database || '(default)';
  const gcpProjectId =
    options.project || cmsPluginOptions.firebaseConfig?.projectId || 'unknown';
  const db = cmsPlugin.getFirestore({databaseId});

  // Parse includes filter.
  const COLLECTION_TYPES = [
    'ActionLogs',
    'Collections',
    'DataSources',
    'Releases',
    'Translations',
    'Users',
  ] as const;
  type CollectionType = (typeof COLLECTION_TYPES)[number];

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

  // Scan the directory and count documents.
  const summary: ImportSummary[] = [];

  // Count Collections.
  const collectionsDir = path.join(importDir, 'Collections');
  if (includes.includes('Collections') && fs.existsSync(collectionsDir)) {
    const collections = fs.readdirSync(collectionsDir);
    let totalDocs = 0;
    const collectionDetails: string[] = [];

    for (const collectionId of collections) {
      const collectionPath = path.join(collectionsDir, collectionId);
      if (!fs.statSync(collectionPath).isDirectory()) continue;

      let collectionCount = 0;
      const draftsDir = path.join(collectionPath, 'Drafts');
      if (fs.existsSync(draftsDir)) {
        const drafts = fs
          .readdirSync(draftsDir)
          .filter((f) => f.endsWith('.json'));
        collectionCount += drafts.length;
      }

      const publishedDir = path.join(collectionPath, 'Published');
      if (fs.existsSync(publishedDir)) {
        const published = fs
          .readdirSync(publishedDir)
          .filter((f) => f.endsWith('.json'));
        collectionCount += published.length;
      }

      if (collectionCount > 0) {
        collectionDetails.push(`${collectionId} (${collectionCount})`);
        totalDocs += collectionCount;
      }
    }

    if (totalDocs > 0) {
      summary.push({
        collectionType: 'Collections',
        count: totalDocs,
        details: collectionDetails.join(', '),
      });
    }
  }

  // Count DataSources.
  const dataSourcesDir = path.join(importDir, 'DataSources');
  if (includes.includes('DataSources') && fs.existsSync(dataSourcesDir)) {
    const dataSources = fs.readdirSync(dataSourcesDir).filter((f) => {
      const p = path.join(dataSourcesDir, f);
      return fs.statSync(p).isDirectory();
    });
    if (dataSources.length > 0) {
      summary.push({
        collectionType: 'DataSources',
        count: dataSources.length,
      });
    }
  }

  // Count Releases.
  const releasesDir = path.join(importDir, 'Releases');
  if (includes.includes('Releases') && fs.existsSync(releasesDir)) {
    const releases = fs
      .readdirSync(releasesDir)
      .filter((f) => f.endsWith('.json'));
    if (releases.length > 0) {
      summary.push({
        collectionType: 'Releases',
        count: releases.length,
      });
    }
  }

  // Count Translations.
  const translationsDir = path.join(importDir, 'Translations');
  if (includes.includes('Translations') && fs.existsSync(translationsDir)) {
    const translations = fs
      .readdirSync(translationsDir)
      .filter((f) => f.endsWith('.json'));
    if (translations.length > 0) {
      summary.push({
        collectionType: 'Translations',
        count: translations.length,
      });
    }
  }

  // Count ActionLogs.
  const actionLogsDir = path.join(importDir, 'ActionLogs');
  if (includes.includes('ActionLogs') && fs.existsSync(actionLogsDir)) {
    const actionLogs = fs
      .readdirSync(actionLogsDir)
      .filter((f) => f.endsWith('.json'));
    if (actionLogs.length > 0) {
      summary.push({
        collectionType: 'ActionLogs',
        count: actionLogs.length,
      });
    }
  }

  // Count Users.
  const usersDir = path.join(importDir, 'Users');
  if (includes.includes('Users') && fs.existsSync(usersDir)) {
    const projectFile = path.join(usersDir, 'project.json');
    if (fs.existsSync(projectFile)) {
      const projectData = JSON.parse(fs.readFileSync(projectFile, 'utf-8'));
      const rolesCount = projectData.roles
        ? Object.keys(projectData.roles).length
        : 0;
      if (rolesCount > 0) {
        summary.push({
          collectionType: 'Users',
          count: rolesCount,
        });
      }
    }
  }

  if (summary.length === 0) {
    console.log('No data found to import.');
    return;
  }

  // Display summary and ask for confirmation.
  const tableData: Record<string, string> = {};

  tableData['Import Directory'] = importDir;
  tableData['GCP Project'] = gcpProjectId;
  tableData['Database'] = `${databaseId}/Projects/${siteId}`;
  tableData['Site'] = siteId;

  for (const item of summary) {
    const parts = [`${item.count}`];
    if (item.details) {
      parts.push(` – ${item.details}`);
    }
    const value = parts.join('');
    tableData[item.collectionType] = value;
  }

  console.log('');
  console.table(tableData);
  console.log('');

  const proceed = await promptYesNo('Proceed with import? (yes/no): ');

  if (!proceed) {
    console.log('Import cancelled.');
    return;
  }

  console.log('\nStarting import...\n');

  // Perform the import.
  for (const item of summary) {
    console.log(`Importing ${item.collectionType}...`);

    if (item.collectionType === 'Collections') {
      await importCollections(db, siteId, importDir);
    } else if (item.collectionType === 'DataSources') {
      await importDataSources(db, siteId, importDir);
    } else if (item.collectionType === 'Releases') {
      await importReleases(db, siteId, importDir);
    } else if (item.collectionType === 'Translations') {
      await importTranslations(db, siteId, importDir);
    } else if (item.collectionType === 'ActionLogs') {
      await importActionLogs(db, siteId, importDir);
    } else if (item.collectionType === 'Users') {
      await importUsers(db, siteId, importDir);
    }
  }

  console.log('\n✅ Import complete!');
}

async function importCollections(db: any, siteId: string, importDir: string) {
  const collectionsDir = path.join(importDir, 'Collections');
  const collections = fs.readdirSync(collectionsDir);

  for (const collectionId of collections) {
    const collectionPath = path.join(collectionsDir, collectionId);
    if (!fs.statSync(collectionPath).isDirectory()) continue;

    // Import Drafts.
    const draftsDir = path.join(collectionPath, 'Drafts');
    if (fs.existsSync(draftsDir)) {
      const drafts = fs
        .readdirSync(draftsDir)
        .filter((f) => f.endsWith('.json'));
      for (const draftFile of drafts) {
        const docId = path.basename(draftFile, '.json');
        const docData = JSON.parse(
          fs.readFileSync(path.join(draftsDir, draftFile), 'utf-8')
        );
        const docPath = `Projects/${siteId}/Collections/${collectionId}/Drafts/${docId}`;
        await db.doc(docPath).set(docData);
      }
      if (drafts.length > 0) {
        console.log(`  - ${collectionId}/Drafts: ${drafts.length} documents`);
      }
    }

    // Import Published.
    const publishedDir = path.join(collectionPath, 'Published');
    if (fs.existsSync(publishedDir)) {
      const published = fs
        .readdirSync(publishedDir)
        .filter((f) => f.endsWith('.json'));
      for (const publishedFile of published) {
        const docId = path.basename(publishedFile, '.json');
        const docData = JSON.parse(
          fs.readFileSync(path.join(publishedDir, publishedFile), 'utf-8')
        );
        const docPath = `Projects/${siteId}/Collections/${collectionId}/Published/${docId}`;
        await db.doc(docPath).set(docData);
      }
      if (published.length > 0) {
        console.log(
          `  - ${collectionId}/Published: ${published.length} documents`
        );
      }
    }
  }
}

async function importDataSources(db: any, siteId: string, importDir: string) {
  const dataSourcesDir = path.join(importDir, 'DataSources');
  const dataSources = fs.readdirSync(dataSourcesDir).filter((f) => {
    const p = path.join(dataSourcesDir, f);
    return fs.statSync(p).isDirectory();
  });

  for (const dataSourceId of dataSources) {
    const dataSourcePath = path.join(dataSourcesDir, dataSourceId);

    // Import metadata.
    const metadataFile = path.join(dataSourcePath, 'metadata.json');
    if (fs.existsSync(metadataFile)) {
      const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
      const docPath = `Projects/${siteId}/DataSources/${dataSourceId}`;
      await db.doc(docPath).set(metadata);
    }

    // Import draft data.
    const draftFile = path.join(dataSourcePath, 'draft.json');
    if (fs.existsSync(draftFile)) {
      const draftData = JSON.parse(fs.readFileSync(draftFile, 'utf-8'));
      const draftPath = `Projects/${siteId}/DataSources/${dataSourceId}/Data/draft`;
      await db.doc(draftPath).set(draftData);
    }

    // Import published data.
    const publishedFile = path.join(dataSourcePath, 'published.json');
    if (fs.existsSync(publishedFile)) {
      const publishedData = JSON.parse(fs.readFileSync(publishedFile, 'utf-8'));
      const publishedPath = `Projects/${siteId}/DataSources/${dataSourceId}/Data/published`;
      await db.doc(publishedPath).set(publishedData);
    }
  }

  console.log(`  - Imported ${dataSources.length} data sources`);
}

async function importReleases(db: any, siteId: string, importDir: string) {
  const releasesDir = path.join(importDir, 'Releases');
  const releases = fs
    .readdirSync(releasesDir)
    .filter((f) => f.endsWith('.json'));

  for (const releaseFile of releases) {
    const releaseId = path.basename(releaseFile, '.json');
    const releaseData = JSON.parse(
      fs.readFileSync(path.join(releasesDir, releaseFile), 'utf-8')
    );
    const docPath = `Projects/${siteId}/Releases/${releaseId}`;
    await db.doc(docPath).set(releaseData);
  }

  console.log(`  - Imported ${releases.length} releases`);
}

async function importTranslations(db: any, siteId: string, importDir: string) {
  const translationsDir = path.join(importDir, 'Translations');
  const translations = fs
    .readdirSync(translationsDir)
    .filter((f) => f.endsWith('.json'));

  for (const translationFile of translations) {
    const translationHash = path.basename(translationFile, '.json');
    const translationData = JSON.parse(
      fs.readFileSync(path.join(translationsDir, translationFile), 'utf-8')
    );
    const docPath = `Projects/${siteId}/Translations/${translationHash}`;
    await db.doc(docPath).set(translationData);
  }

  console.log(`  - Imported ${translations.length} translations`);
}

async function importActionLogs(db: any, siteId: string, importDir: string) {
  const actionLogsDir = path.join(importDir, 'ActionLogs');
  const actionLogs = fs
    .readdirSync(actionLogsDir)
    .filter((f) => f.endsWith('.json'));

  for (const actionLogFile of actionLogs) {
    const actionLogId = path.basename(actionLogFile, '.json');
    const actionLogData = JSON.parse(
      fs.readFileSync(path.join(actionLogsDir, actionLogFile), 'utf-8')
    );
    const docPath = `Projects/${siteId}/ActionLogs/${actionLogId}`;
    await db.doc(docPath).set(actionLogData);
  }

  console.log(`  - Imported ${actionLogs.length} action logs`);
}

async function importUsers(db: any, siteId: string, importDir: string) {
  const usersDir = path.join(importDir, 'Users');
  const projectFile = path.join(usersDir, 'project.json');

  if (fs.existsSync(projectFile)) {
    const projectData = JSON.parse(fs.readFileSync(projectFile, 'utf-8'));
    const docPath = `Projects/${siteId}`;
    await db.doc(docPath).set(projectData, {merge: true});

    const rolesCount = projectData.roles
      ? Object.keys(projectData.roles).length
      : 0;
    console.log(`  - Imported ${rolesCount} users`);
  }
}

async function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'yes' || normalized === 'y');
    });
  });
}
