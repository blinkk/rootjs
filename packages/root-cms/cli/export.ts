import fs from 'node:fs';
import path from 'node:path';
import {loadRootConfig} from '@blinkk/root/node';
import {getCmsPlugin} from '../core/client.js';
import {getPathStatus, parseFilters, pLimit, LimitFunction} from './utils.js';

export interface ExportOptions {
  /** Filter to specific content. */
  filter?: string;
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

  // Parse filter.
  const {includes, excludes} = parseFilters(options.filter);
  const collectionsToExport = allCollectionIds.filter((id: string) => {
    const status = getPathStatus(id, includes, excludes);
    return status !== 'SKIP' && status !== 'EXCLUDE';
  });

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
    Collections: collectionsToExport.join(', '),
    Filter: options.filter || '(none)',
  });
  console.log('');

  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, {recursive: true});
  }

  // Export project document (e.g. Projects/www) to preserve settings/roles.
  // Only export if no filter is specified.
  if (!options.filter) {
    const projectDoc = await projectRef.get();
    if (projectDoc.exists) {
      const projectData = projectDoc.data();
      const projectFilePath = path.join(exportDir, '__data.json');
      fs.writeFileSync(
        projectFilePath,
        JSON.stringify(convertForExport(projectData), null, 2)
      );
      console.log('Exported project document to __data.json');
    }
  }

  // Export each collection type.
  const limit = pLimit(10);
  for (const collectionType of collectionsToExport) {
    console.log(`Exporting ${collectionType}...`);
    const collectionPath = `Projects/${siteId}/${collectionType}`;
    const collectionDir = path.join(exportDir, collectionType);
    await exportCollection(
      db,
      collectionPath,
      collectionDir,
      collectionType,
      collectionType,
      includes,
      excludes,
      limit
    );
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
  displayName: string,
  relativePath: string,
  includes: string[],
  excludes: string[],
  limit: LimitFunction
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
    spinner,
    relativePath,
    includes,
    excludes,
    limit
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
  spinner: Spinner,
  relativePath: string,
  includes: string[],
  excludes: string[],
  limit: LimitFunction
) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, {recursive: true});
  }

  const collection = db.collection(collectionPath);

  // Get all document references.
  const refs = await limit<any[]>(() => collection.listDocuments());
  if (refs.length === 0) {
    return;
  }

  // Fetch data for all existing documents efficiently.
  const snapshot = await limit<any>(() => collection.get());
  const docMap = new Map();
  snapshot.docs.forEach((doc: any) => {
    docMap.set(doc.id, doc);
  });

  await Promise.all(
    refs.map(async (ref: any) => {
      const doc = docMap.get(ref.id);
      const subcollections = await limit<any[]>(() => ref.listCollections());
      const hasSubcollections = subcollections.length > 0;

      const docRelativePath = `${relativePath}/${ref.id}`;
      const docStatus = getPathStatus(docRelativePath, includes, excludes);

      // Determine where to save the document data.
      // If it has subcollections, save as __data.json inside the document folder.
      // Otherwise, save as {docId}.json.
      if (doc && docStatus !== 'SKIP' && docStatus !== 'EXCLUDE') {
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

        fs.writeFileSync(
          filePath,
          JSON.stringify(convertForExport(docData), null, 2)
        );
        stats.count++;
        spinner.update(`Exporting ${stats.count} documents...`);
      }

      // Export subcollections.
      for (const subcollection of subcollections) {
        const subRelativePath = `${docRelativePath}/${subcollection.id}`;
        const status = getPathStatus(subRelativePath, includes, excludes);
        if (status === 'SKIP' || status === 'EXCLUDE') {
          continue;
        }

        const subcollectionDir = path.join(outputDir, ref.id, subcollection.id);
        await exportCollectionRecursive(
          db,
          subcollection.path,
          subcollectionDir,
          stats,
          spinner,
          subRelativePath,
          includes,
          excludes,
          limit
        );
      }
    })
  );
}

function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}t${hour}${minute}`;
}

/**
 * Recursively converts Firestore types to JSON-serializable format.
 */
function convertForExport(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle DocumentReference.
  // Note: We check for the `path` property and `firestore` property to identify
  // a DocumentReference, as `instanceof` might not work if the instance comes
  // from a different version of the library or if we don't have the class imported.
  // However, checking `constructor.name` or specific properties is safer.
  if (
    typeof obj === 'object' &&
    typeof obj.path === 'string' &&
    obj.constructor.name === 'DocumentReference'
  ) {
    return {_referencePath: obj.path};
  }

  // Recursively process arrays.
  if (Array.isArray(obj)) {
    return obj.map((item) => convertForExport(item));
  }

  // Recursively process objects.
  if (typeof obj === 'object') {
    // Check if it's a plain object or a Firestore type that we want to preserve as-is
    // (like Timestamp or GeoPoint which serialize to JSON fine).
    const converted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertForExport(value);
    }
    return converted;
  }

  return obj;
}
