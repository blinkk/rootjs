import fs from 'node:fs';
import path from 'node:path';
import * as readline from 'node:readline';
import {loadRootConfig} from '@blinkk/root/node';
import {Timestamp, GeoPoint} from 'firebase-admin/firestore';
import {RootCMSClient, unmarshalData, getCmsPlugin} from '../core/client.js';

export interface DocsGetOptions {
  /** Doc mode: "draft" or "published". */
  mode?: string;
  /** Whether to output raw firestore data. */
  raw?: boolean;
}

export interface DocsSetOptions {
  /** Doc mode: "draft" or "published". */
  mode?: string;
}

export interface DocsDownloadOptions {
  /** Doc mode: "draft" or "published". */
  mode?: string;
}

export interface DocsUploadOptions {
  /** Doc mode: "draft" or "published". */
  mode?: string;
}

/**
 * Fetches a single doc and writes it to a JSON file.
 *
 * Usage:
 *   root-cms docs.get <docId> [outputPath] [--mode draft] [--raw]
 */
export async function docsGet(
  docId: string,
  outputPath: string | undefined,
  options: DocsGetOptions
) {
  const mode = validateMode(options.mode);
  const rootDir = process.cwd();
  const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
  const client = new RootCMSClient(rootConfig);

  const {collection, slug} = parseDocId(docId);
  const rawData = await client.getRawDoc(collection, slug, {mode});
  if (!rawData) {
    throw new Error(`doc not found: ${docId}`);
  }

  const data = options.raw ? rawData : unmarshalData(rawData);
  const json = JSON.stringify(convertForExport(data), null, 2);

  const resolvedPath = path.resolve(
    outputPath || path.join('dist', `${collection}/${slug}.json`)
  );
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {recursive: true});
  }
  fs.writeFileSync(resolvedPath, json);
  console.log(`Wrote ${docId} to ${resolvedPath}`);
}

/**
 * Sets a single doc's data from a JSON file.
 *
 * Usage:
 *   root-cms docs.set <docId> <filepath> [--mode draft]
 */
export async function docsSet(
  docId: string,
  filepath: string,
  options: DocsSetOptions
) {
  const mode = validateMode(options.mode);
  const rootDir = process.cwd();
  const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
  const client = new RootCMSClient(rootConfig);
  const cmsPlugin = getCmsPlugin(rootConfig);
  const db = cmsPlugin.getFirestore();

  const filePath = path.resolve(filepath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`file not found: ${filePath}`);
  }

  const rawJson = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const data = convertFirestoreTypes(rawJson, db);

  const {collection, slug} = parseDocId(docId);
  await client.setRawDoc(collection, slug, data, {mode});
  console.log(`Updated ${docId} (${mode})`);
}

/**
 * Downloads all docs in a collection to a local directory.
 *
 * Usage:
 *   root-cms docs.download <collection> [outputDir] [--mode draft]
 */
export async function docsDownload(
  collectionId: string,
  outputDirArg: string | undefined,
  options: DocsDownloadOptions
) {
  const mode = validateMode(options.mode);
  const rootDir = process.cwd();
  const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
  const client = new RootCMSClient(rootConfig);

  const outputDir = path.resolve(
    outputDirArg || path.join('dist', collectionId)
  );

  // If the output directory exists and is not empty, prompt user to confirm.
  if (fs.existsSync(outputDir)) {
    const entries = fs.readdirSync(outputDir);
    if (entries.length > 0) {
      const proceed = await promptYesNo(
        `Output directory "${outputDir}" is not empty. Delete contents before downloading? (yes/no): `
      );
      if (!proceed) {
        console.log('Download cancelled.');
        return;
      }
      for (const entry of entries) {
        fs.rmSync(path.join(outputDir, entry), {recursive: true, force: true});
      }
    }
  } else {
    fs.mkdirSync(outputDir, {recursive: true});
  }

  const {docs} = await client.listDocs<any>(collectionId, {
    mode,
    raw: true,
  });

  if (docs.length === 0) {
    console.log(`No docs found in collection "${collectionId}" (${mode}).`);
    return;
  }

  for (const doc of docs) {
    const slug = doc.slug || doc.id?.split('/')[1] || 'unknown';
    const data = convertForExport(doc);
    const filePath = path.join(outputDir, `${slug}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  console.log(
    `Downloaded ${docs.length} doc(s) from "${collectionId}" (${mode}) to ${outputDir}`
  );
}

/**
 * Uploads docs from a local directory to a collection.
 *
 * Usage:
 *   root-cms docs.upload <collection> <dir> [--mode draft]
 */
export async function docsUpload(
  collectionId: string,
  dir: string,
  options: DocsUploadOptions
) {
  const mode = validateMode(options.mode);
  const rootDir = process.cwd();
  const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
  const client = new RootCMSClient(rootConfig);
  const cmsPlugin = getCmsPlugin(rootConfig);
  const db = cmsPlugin.getFirestore();

  const inputDir = path.resolve(dir);
  if (!fs.existsSync(inputDir)) {
    throw new Error(`directory not found: ${inputDir}`);
  }

  const files = fs.readdirSync(inputDir).filter((f) => f.endsWith('.json'));

  if (files.length === 0) {
    console.log(`No JSON files found in ${inputDir}.`);
    return;
  }

  let count = 0;
  for (const file of files) {
    const slug = path.basename(file, '.json');
    const filePath = path.join(inputDir, file);
    const rawJson = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const data = convertFirestoreTypes(rawJson, db);
    await client.setRawDoc(collectionId, slug, data, {mode});
    count++;
  }

  console.log(
    `Uploaded ${count} doc(s) to "${collectionId}" (${mode}) from ${inputDir}`
  );
}

/**
 * Validates the mode option and returns a typed value.
 */
/**
 * Prompts the user for a yes/no confirmation.
 */
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

/**
 * Validates the mode option and returns a typed value.
 */
function validateMode(mode?: string): 'draft' | 'published' {
  if (!mode || mode === 'draft') {
    return 'draft';
  }
  if (mode === 'published') {
    return 'published';
  }
  throw new Error(`invalid mode: "${mode}". Must be "draft" or "published".`);
}

/**
 * Parses a docId (e.g. "Pages/foo") into collection and slug.
 */
function parseDocId(docId: string): {collection: string; slug: string} {
  const sepIndex = docId.indexOf('/');
  if (sepIndex <= 0) {
    throw new Error(
      `invalid doc id: "${docId}". Expected format: <collection>/<slug>`
    );
  }
  const collection = docId.slice(0, sepIndex);
  const slug = docId.slice(sepIndex + 1);
  if (!collection || !slug) {
    throw new Error(
      `invalid doc id: "${docId}". Expected format: <collection>/<slug>`
    );
  }
  return {collection, slug};
}

/**
 * Recursively converts Firestore types to JSON-serializable format.
 */
function convertForExport(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle DocumentReference.
  if (
    typeof obj === 'object' &&
    typeof obj.path === 'string' &&
    obj.constructor?.name === 'DocumentReference'
  ) {
    return {_referencePath: obj.path};
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => convertForExport(item));
  }

  if (typeof obj === 'object') {
    const converted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertForExport(value);
    }
    return converted;
  }

  return obj;
}

/**
 * Recursively converts exported JSON back to Firestore types.
 */
function convertFirestoreTypes(obj: any, db: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Timestamp objects ({_seconds, _nanoseconds}).
  if (
    typeof obj === 'object' &&
    '_seconds' in obj &&
    '_nanoseconds' in obj &&
    Object.keys(obj).length === 2
  ) {
    return new Timestamp(obj._seconds, obj._nanoseconds);
  }

  // GeoPoint objects ({_latitude, _longitude}).
  if (
    typeof obj === 'object' &&
    '_latitude' in obj &&
    '_longitude' in obj &&
    Object.keys(obj).length === 2
  ) {
    return new GeoPoint(obj._latitude, obj._longitude);
  }

  // DocumentReference objects ({_referencePath}).
  if (
    typeof obj === 'object' &&
    '_referencePath' in obj &&
    Object.keys(obj).length === 1
  ) {
    return db.doc(obj._referencePath);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => convertFirestoreTypes(item, db));
  }

  if (typeof obj === 'object') {
    const converted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertFirestoreTypes(value, db);
    }
    return converted;
  }

  return obj;
}
