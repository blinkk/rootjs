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
    const collectionPath = `Projects/${siteId}/${collectionType}`;
    const collectionDir = path.join(exportDir, collectionType);
    await exportCollection(db, collectionPath, collectionDir, collectionType);
  }

  console.log(`\n✅ Export complete! Data saved to: ${exportDir}`);
}

/**
 * Simple terminal spinner.
 */
class Spinner {
  private timer: NodeJS.Timeout | null = null;
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private currentFrame = 0;
  private text: string;

  constructor(text: string) {
    this.text = text;
  }

  start() {
    this.render();
    this.timer = setInterval(() => {
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
      this.render();
    }, 80);
  }

  update(text: string) {
    this.text = text;
    this.render();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    process.stdout.write('\r\x1b[K'); // Clear line
  }

  private render() {
    process.stdout.write(`\r${this.frames[this.currentFrame]} ${this.text}`);
  }
}

/**
 * Generic function to export a collection and all its subcollections.
 */
async function exportCollection(
  db: any,
  collectionPath: string,
  outputDir: string,
  displayName: string
) {
  const stats = {count: 0};
  const spinner = new Spinner(`Exporting ${displayName}...`);
  spinner.start();

  // Export recursively.
  await exportCollectionRecursive(
    db,
    collectionPath,
    outputDir,
    stats,
    spinner
  );

  spinner.stop();
  console.log(`  - ${displayName}: ${stats.count} documents`);
}

/**
 * Recursively exports documents and subcollections.
 */
async function exportCollectionRecursive(
  db: any,
  collectionPath: string,
  outputDir: string,
  stats: {count: number},
  spinner: Spinner
) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, {recursive: true});
  }

  const collection = db.collection(collectionPath);

  // Get all document references (including phantom docs).
  const refs = await collection.listDocuments();
  if (refs.length === 0) {
    return;
  }

  // Fetch data for all existing documents efficiently.
  const snapshot = await collection.get();
  const docMap = new Map();
  snapshot.docs.forEach((doc: any) => {
    docMap.set(doc.id, doc);
  });

  for (const ref of refs) {
    const doc = docMap.get(ref.id);

    // If document exists (has data), export it.
    if (doc) {
      const docData = doc.data();
      const filePath = path.join(outputDir, `${doc.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(docData, null, 2));
      stats.count++;
      spinner.update(`Exporting ${stats.count} documents...`);
    }

    // Export subcollections for ALL documents (real and phantom).
    const subcollections = await ref.listCollections();
    for (const subcollection of subcollections) {
      const subcollectionDir = path.join(outputDir, ref.id, subcollection.id);
      await exportCollectionRecursive(
        db,
        subcollection.path,
        subcollectionDir,
        stats,
        spinner
      );
    }
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
