import fs from 'node:fs';
import path from 'node:path';
import {loadRootConfig} from '@blinkk/root/node';
import {RootCMSClient, type UploadAssetOptions} from '../core/client.js';

export interface AssetsUploadOptions {
  /** Asset library folder to upload into, e.g. `marketing/q1`. */
  folder?: string;
  /** Asset display name (single file only). */
  name?: string;
  /** Id of an existing asset whose file should be replaced (single file only). */
  assetId?: string;
  /** Alt text for the uploaded file(s). */
  alt?: string;
  /** GCS object naming strategy: `hash`, `hash-path` or `clean`. */
  namingMode?: string;
  /** Cache-Control header for the GCS object(s). */
  cacheControl?: string;
  /** Set to false by `--no-gci` to skip the Google Cloud Image service. */
  gci?: boolean;
  /** Set to false by `--no-sync` to skip updating docs that use the asset. */
  sync?: boolean;
  /** Email attributed as the author of the change. */
  modifiedBy?: string;
}

/** A local file to upload and the asset library folder it goes into. */
export interface AssetUploadItem {
  filePath: string;
  folder: string;
}

const NAMING_MODES = ['hash', 'hash-path', 'clean'];

/**
 * Uploads local files (or directories of files) to the asset library. Files
 * that already exist in the destination folder (by name) are replaced, and
 * the change is fanned out to every draft doc that uses the asset.
 *
 * Usage:
 *   root-cms assets.upload <paths...> [--folder <folder>] [--alt <text>]
 */
export async function assetsUpload(
  paths: string[],
  options: AssetsUploadOptions
) {
  const items = collectUploadItems(paths, options.folder || '');
  if (items.length === 0) {
    throw new Error('no files to upload');
  }
  if (items.length > 1 && (options.name || options.assetId)) {
    throw new Error(
      '--name and --asset-id can only be used with a single file'
    );
  }
  if (options.namingMode && !NAMING_MODES.includes(options.namingMode)) {
    throw new Error(
      `invalid --naming-mode: "${options.namingMode}". Must be one of: ${NAMING_MODES.join(', ')}.`
    );
  }

  const rootDir = process.cwd();
  const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
  const client = new RootCMSClient(rootConfig);

  const failed: string[] = [];
  const failedDocIds = new Set<string>();
  for (const item of items) {
    const uploadOptions: UploadAssetOptions = {
      folder: item.folder,
      name: options.name,
      assetId: options.assetId,
      alt: options.alt,
      namingMode: options.namingMode as UploadAssetOptions['namingMode'],
      cacheControl: options.cacheControl,
      disableGci: options.gci === false,
      syncDocs: options.sync !== false,
      modifiedBy: options.modifiedBy,
    };
    try {
      const res = await client.uploadAsset(item.filePath, uploadOptions);
      const assetPath = [res.asset.parent, res.asset.name]
        .filter(Boolean)
        .join('/');
      console.log(
        `${res.status}: ${assetPath} (id: ${res.asset.id}) -> ${res.asset.file?.src}`
      );
      if (res.sync) {
        const {updatedDocIds} = res.sync;
        console.log(
          `  updated ${updatedDocIds.length} doc(s)${updatedDocIds.length > 0 ? `: ${updatedDocIds.join(', ')}` : ''}`
        );
        res.sync.failedDocIds.forEach((docId) => failedDocIds.add(docId));
      }
    } catch (err: any) {
      console.error(`failed: ${item.filePath}: ${err?.message || err}`);
      failed.push(item.filePath);
    }
  }

  if (failedDocIds.size > 0) {
    console.error(
      `failed to update doc(s): ${Array.from(failedDocIds).join(', ')}. ` +
        'retry with `root-cms client.call syncAssetToDocs \'["<assetId>"]\'`.'
    );
  }
  if (failed.length > 0 || failedDocIds.size > 0) {
    process.exitCode = 1;
  }
  console.log(
    `done: uploaded ${items.length - failed.length} of ${items.length} file(s).`
  );
}

/**
 * Expands the given paths into the list of files to upload. Directories are
 * walked recursively and their structure is mirrored as subfolders of the
 * destination folder (e.g. `./icons/social/x.svg` uploaded to `brand` lands
 * in `brand/icons/social`). Hidden files and directories are skipped.
 */
export function collectUploadItems(
  paths: string[],
  folder: string
): AssetUploadItem[] {
  const items: AssetUploadItem[] = [];
  for (const inputPath of paths) {
    const resolved = path.resolve(inputPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`file not found: ${inputPath}`);
    }
    if (fs.statSync(resolved).isDirectory()) {
      walkDir(resolved, joinFolder(folder, path.basename(resolved)), items);
    } else {
      items.push({filePath: resolved, folder});
    }
  }
  return items;
}

function walkDir(dir: string, folder: string, items: AssetUploadItem[]) {
  const entries = fs
    .readdirSync(dir, {withFileTypes: true})
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(entryPath, joinFolder(folder, entry.name), items);
    } else if (entry.isFile()) {
      items.push({filePath: entryPath, folder});
    }
  }
}

function joinFolder(parent: string, name: string) {
  const cleanParent = parent.replace(/^\/+|\/+$/g, '');
  return cleanParent ? `${cleanParent}/${name}` : name;
}
