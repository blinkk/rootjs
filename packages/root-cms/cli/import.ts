import fs from 'node:fs';
import path from 'node:path';
import * as readline from 'node:readline';
import {loadRootConfig} from '@blinkk/root/node';
import cliProgress from 'cli-progress';
import {Timestamp} from 'firebase-admin/firestore';
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

  // Get available collections from the import directory.
  const entries = fs.readdirSync(importDir, {withFileTypes: true});
  const availableCollections = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  // Parse includes filter.
  let includes: string[] = availableCollections;
  if (options.include) {
    const requestedIncludes = options.include
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Filter requested includes to ensure they exist in the import directory.
    includes = requestedIncludes.filter((inc) =>
      availableCollections.includes(inc)
    );

    if (includes.length === 0) {
      throw new Error(
        `No valid collection types specified in --include. Available types: ${availableCollections.join(
          ', '
        )}`
      );
    }
  }

  // Scan the directory and count documents.
  const summary: ImportSummary[] = [];

  for (const collectionType of includes) {
    const collectionDir = path.join(importDir, collectionType);
    if (fs.existsSync(collectionDir)) {
      const count = countJsonFilesRecursive(collectionDir);
      if (count > 0) {
        summary.push({
          collectionType,
          count,
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
  tableData['--'] = '';

  for (const item of summary) {
    tableData[item.collectionType] = `${item.count} documents`;
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
    const collectionPath = `Projects/${siteId}/${item.collectionType}`;
    const collectionDir = path.join(importDir, item.collectionType);
    await importCollection(
      db,
      collectionPath,
      collectionDir,
      item.collectionType,
      item.count
    );
  }

  // Import project document if it exists.
  const projectFilePath = path.join(importDir, '__data.json');
  if (fs.existsSync(projectFilePath)) {
    console.log('Importing project document...');
    const rawData = JSON.parse(fs.readFileSync(projectFilePath, 'utf-8'));
    const projectData = convertTimestamps(rawData);
    const projectPath = `Projects/${siteId}`;
    await db.doc(projectPath).set(projectData, {merge: true});
    console.log('  - Project document updated');
  }

  console.log('\n✅ Import complete!');
}

/**
 * Recursively counts .json files in a directory.
 */
function countJsonFilesRecursive(dir: string): number {
  let count = 0;
  const entries = fs.readdirSync(dir, {withFileTypes: true});
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += countJsonFilesRecursive(path.join(dir, entry.name));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      count++;
    }
  }
  return count;
}

/**
 * Generic function to import a collection and all its subcollections.
 */
async function importCollection(
  db: any,
  collectionPath: string,
  inputDir: string,
  displayName: string,
  totalDocs: number
) {
  console.log(`Importing ${displayName}...`);

  const progressBar = new cliProgress.SingleBar({
    format: `Importing ${displayName} [{bar}] {percentage}% | {value}/{total}`,
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
  });
  progressBar.start(totalDocs, 0);

  await importCollectionRecursive(db, collectionPath, inputDir, progressBar);

  progressBar.stop();
  console.log(`  - ${displayName}: ${totalDocs} documents`);
}

/**
 * Recursively converts timestamp objects to Firestore Timestamps.
 * Firestore timestamps are exported as {_seconds: number, _nanoseconds: number}.
 */
function convertTimestamps(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Check if this object is a timestamp.
  if (
    typeof obj === 'object' &&
    '_seconds' in obj &&
    '_nanoseconds' in obj &&
    Object.keys(obj).length === 2
  ) {
    return new Timestamp(obj._seconds, obj._nanoseconds);
  }

  // Recursively process arrays.
  if (Array.isArray(obj)) {
    return obj.map((item) => convertTimestamps(item));
  }

  // Recursively process objects.
  if (typeof obj === 'object') {
    const converted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertTimestamps(value);
    }
    return converted;
  }

  return obj;
}

/**
 * Recursively imports documents and subcollections from a directory.
 */
async function importCollectionRecursive(
  db: any,
  collectionPath: string,
  inputDir: string,
  progressBar?: cliProgress.SingleBar
) {
  if (!fs.existsSync(inputDir)) {
    return;
  }

  const entries = fs.readdirSync(inputDir, {withFileTypes: true});

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      // Import document.
      const rawData = JSON.parse(
        fs.readFileSync(path.join(inputDir, entry.name), 'utf-8')
      );
      // Convert timestamps before importing.
      const docData = convertTimestamps(rawData);

      if (entry.name === '__data.json') {
        // Handle __data.json (data for the current container document).
        await db.doc(collectionPath).set(docData, {merge: true});
      } else {
        // Standard document file (DocId.json).
        const docId = path.basename(entry.name, '.json');
        await db.doc(`${collectionPath}/${docId}`).set(docData);
      }

      if (progressBar) {
        progressBar.increment();
      }
    } else if (entry.isDirectory()) {
      // Recursively import subcollection.
      const subCollectionPath = `${collectionPath}/${entry.name}`;
      const subCollectionDir = path.join(inputDir, entry.name);
      await importCollectionRecursive(
        db,
        subCollectionPath,
        subCollectionDir,
        progressBar
      );
    }
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
