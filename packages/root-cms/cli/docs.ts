import fs from 'node:fs';
import path from 'node:path';
import * as readline from 'node:readline';
import {fileURLToPath} from 'node:url';
import {loadRootConfig, viteSsrLoadModule} from '@blinkk/root/node';
import {Timestamp, GeoPoint} from 'firebase-admin/firestore';
import {RootCMSClient, unmarshalData, getCmsPlugin} from '../core/client.js';
import {convertForExport} from './utils.js';

type ProjectModule = typeof import('../core/project.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

export interface DocsUpdateOptions {
  /** Whether to skip schema validation. */
  noValidate?: boolean;
  /** Path to a JSON file containing the value. */
  file?: string;
}

/**
 * Fetches a single doc and outputs it as JSON.
 * If an output path is provided, writes to a file. Otherwise, writes to stdout.
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

  if (outputPath) {
    const resolvedPath = path.resolve(outputPath);
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, {recursive: true});
    }
    fs.writeFileSync(resolvedPath, json);
    console.error(`Wrote ${docId} to ${resolvedPath}`);
  } else {
    process.stdout.write(json + '\n');
  }
}

/**
 * Sets a single doc's data from a JSON file or stdin.
 * If a filepath is provided, reads from the file. Otherwise, reads from stdin.
 *
 * Usage:
 *   root-cms docs.set <docId> [filepath] [--mode draft]
 *   cat data.json | root-cms docs.set Pages/home
 */
export async function docsSet(
  docId: string,
  filepath: string | undefined,
  options: DocsSetOptions
) {
  const mode = validateMode(options.mode);
  const rootDir = process.cwd();
  const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
  const client = new RootCMSClient(rootConfig);
  const cmsPlugin = getCmsPlugin(rootConfig);
  const db = cmsPlugin.getFirestore();

  let jsonStr: string;
  if (filepath) {
    const filePath = path.resolve(filepath);
    if (!fs.existsSync(filePath)) {
      throw new Error(`file not found: ${filePath}`);
    }
    jsonStr = fs.readFileSync(filePath, 'utf-8');
  } else {
    jsonStr = await readStdin();
  }

  const rawJson = JSON.parse(jsonStr);
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
 * Updates a single field in a draft doc by its deep key path.
 *
 * The value can be provided as:
 * - An inline argument (parsed as JSON, falling back to a plain string)
 * - A file path via the --file option
 * - Piped via stdin (when neither inline value nor --file is provided)
 *
 * Validates the updated document against the collection schema by default.
 * Use --no-validate to skip validation.
 *
 * Usage:
 *   root-cms docs.update Pages/home hero.title '"New Title"'
 *   root-cms docs.update Pages/home meta.og '{"title": "OG"}'
 *   root-cms docs.update Pages/home hero.title --file value.json
 *   cat value.json | root-cms docs.update Pages/home hero.title
 */
export async function docsUpdate(
  docId: string,
  fieldPath: string,
  inlineValue: string | undefined,
  options: DocsUpdateOptions
) {
  const rootDir = process.cwd();
  const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
  const client = new RootCMSClient(rootConfig);

  let fieldValue: any;
  if (isDef(inlineValue)) {
    fieldValue = parseValue(inlineValue);
  } else if (options.file) {
    const filePath = path.resolve(options.file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`file not found: ${filePath}`);
    }
    const jsonStr = fs.readFileSync(filePath, 'utf-8');
    fieldValue = JSON.parse(jsonStr);
  } else {
    const jsonStr = await readStdin();
    fieldValue = JSON.parse(jsonStr);
  }

  const validate = !options.noValidate;

  // Load the collection schema via Vite SSR so that `import.meta.glob` in
  // project.ts is resolved correctly (it does not work in plain Node.js).
  const collectionId = docId.split('/')[0];
  let collectionSchema;
  if (validate) {
    const modulePath = path.resolve(__dirname, '../core/project.js');
    const project = (await viteSsrLoadModule(
      rootConfig,
      modulePath
    )) as ProjectModule;
    collectionSchema = project.getCollectionSchema(collectionId);
  }

  await client.updateDraftData(docId, fieldPath, fieldValue, {
    validate,
    collectionSchema: collectionSchema ?? undefined,
  });
  console.log(`Updated ${docId} field "${fieldPath}"`);
}

/**
 * Returns true if the value is not undefined and not null.
 */
function isDef<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null;
}

/**
 * Parses a CLI value string. Attempts JSON.parse first, falling back to a
 * plain string if parsing fails.
 */
function parseValue(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Reads all data from stdin as a string.
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

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
