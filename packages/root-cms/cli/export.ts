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

export async function exportData(options: ExportOptions) {
  const rootDir = process.cwd();
  const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
  const cmsPlugin = getCmsPlugin(rootConfig);
  const cmsPluginOptions = cmsPlugin.getConfig();
  const siteId = options.site || cmsPluginOptions.id || 'default';
  const databaseId = options.database || '(default)';
  const db = cmsPlugin.getFirestore({databaseId});

  // Get all collections in the project.
  const projectPath = `Projects/${siteId}`;
  const projectRef = db.doc(projectPath);
  const collections = await projectRef.listCollections();
  const allCollectionIds = collections.map((c: any) => c.id);

  // Parse includes filter.
  let includes: string[] = allCollectionIds;
  if (options.include) {
    const requestedIncludes = options.include
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    includes = requestedIncludes;
  }

  if (includes.length === 0) {
    console.log('No collections found to export.');
    return;
  }

  // Create export directory with timestamp.
  const now = new Date();
  const timestamp = formatTimestamp(now);
  const gcpProjectId =
    options.project || cmsPluginOptions.firebaseConfig?.projectId || 'default';
  const exportDir =
    `export_${gcpProjectId}_${databaseId}_${siteId}_${timestamp}`
      .replace(/\(/g, '')
      .replace(/\)/g, '');
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

  // Export project document (e.g. Projects/www) to preserve settings/roles.
  const projectDoc = await projectRef.get();
  if (projectDoc.exists) {
    const projectData = projectDoc.data();
    const projectFilePath = path.join(exportDir, '__data.json');
    fs.writeFileSync(projectFilePath, JSON.stringify(projectData, null, 2));
    console.log('Exported project document to __data.json');
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

  // Get all document references.
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
    const subcollections = await ref.listCollections();
    const hasSubcollections = subcollections.length > 0;

    // Determine where to save the document data.
    // If it has subcollections, save as __data.json inside the document folder.
    // Otherwise, save as {docId}.json.
    if (doc) {
      const docData = doc.data();
      let filePath: string;

      if (hasSubcollections) {
        const docDir = path.join(outputDir, doc.id);
        if (!fs.existsSync(docDir)) {
          fs.mkdirSync(docDir, {recursive: true});
        }
        filePath = path.join(docDir, '__data.json');
      } else {
        filePath = path.join(outputDir, `${doc.id}.json`);
      }

      fs.writeFileSync(filePath, JSON.stringify(docData, null, 2));
      stats.count++;
      spinner.update(`Exporting ${stats.count} documents...`);
    }

    // Export subcollections.
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
