import fs from 'node:fs';
import path from 'node:path';

/** Filename of the committed, CLI-managed secrets manifest. */
export const MANIFEST_FILENAME = '.root.secrets.json';

const GSM_KEY_RE = /^[A-Za-z0-9_-]{1,255}$/;
const ENV_NAME_RE = /^[A-Za-z0-9_]+$/;

/** A single managed secret's metadata (no value is ever stored here). */
export interface SecretEntry {
  /** ISO-8601 UTC timestamp of when the value last changed. */
  updatedAt: string;
  /** Email of whoever last changed the value (best-effort). */
  updatedBy?: string;
}

/** Optional reference to a shared manifest that this site pulls keys from. */
export interface ImportConfig {
  /** Path to the shared manifest, relative to this manifest's directory. */
  manifest: string;
  /** Allowlist of names to import; omit or `'*'` to import all shared keys. */
  keys?: string[] | '*';
}

/** The committed manifest schema. */
export interface Manifest {
  version: number;
  gcpProjectId: string;
  gsmKey: string;
  import?: ImportConfig;
  secrets: Record<string, SecretEntry>;
}

/** A fully-resolved managed key, after following any `import`. */
export interface ManagedKey {
  name: string;
  gsmKey: string;
  gcpProjectId: string;
  updatedAt: string;
}

/** Resolved view of a site manifest plus its imported shared keys. */
export interface ResolvedSecrets {
  rootDir: string;
  site: Manifest;
  shared?: Manifest;
  keys: ManagedKey[];
}

/** Absolute path to a directory's manifest file. */
export function manifestPath(dir: string): string {
  return path.join(dir, MANIFEST_FILENAME);
}

/** Whether a string is a valid env var name for a managed secret. */
export function isValidEnvName(name: string): boolean {
  return ENV_NAME_RE.test(name);
}

/** Reads and validates a manifest, returning null if the file doesn't exist. */
export async function readManifest(filePath: string): Promise<Manifest | null> {
  let raw: string;
  try {
    raw = await fs.promises.readFile(filePath, 'utf8');
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`invalid JSON in ${filePath}`);
  }
  return validateManifest(parsed, filePath);
}

/**
 * Writes a manifest with stable formatting: `secrets` keys are sorted so that
 * setting/removing values produces minimal, readable git diffs.
 */
export async function writeManifest(
  filePath: string,
  manifest: Manifest
): Promise<void> {
  const sortedSecrets: Record<string, SecretEntry> = {};
  for (const name of Object.keys(manifest.secrets).sort()) {
    sortedSecrets[name] = manifest.secrets[name];
  }
  const ordered: Manifest = {
    version: manifest.version,
    gcpProjectId: manifest.gcpProjectId,
    gsmKey: manifest.gsmKey,
    ...(manifest.import ? {import: manifest.import} : {}),
    secrets: sortedSecrets,
  };
  await fs.promises.mkdir(path.dirname(filePath), {recursive: true});
  await fs.promises.writeFile(
    filePath,
    JSON.stringify(ordered, null, 2) + '\n',
    'utf8'
  );
}

/** Creates an empty manifest header. */
export function emptyManifest(gcpProjectId: string, gsmKey: string): Manifest {
  return {version: 1, gcpProjectId, gsmKey, secrets: {}};
}

/**
 * Resolves the full set of managed keys for a site: the site manifest's own
 * `secrets` plus any keys pulled in via `import` from a shared manifest.
 *
 * Returns null if the site has no manifest. Throws on validation errors:
 * unknown imported keys, a name declared in both the site and the imported
 * subset, or a shared manifest whose `gcpProjectId` differs from the site's.
 */
export async function resolveManagedKeys(
  rootDir: string
): Promise<ResolvedSecrets | null> {
  const sitePath = manifestPath(rootDir);
  const site = await readManifest(sitePath);
  if (!site) {
    return null;
  }

  const keys: ManagedKey[] = [];
  const siteNames = new Set<string>();
  for (const [name, entry] of Object.entries(site.secrets)) {
    siteNames.add(name);
    keys.push({
      name,
      gsmKey: site.gsmKey,
      gcpProjectId: site.gcpProjectId,
      updatedAt: entry.updatedAt,
    });
  }

  let shared: Manifest | undefined;
  if (site.import) {
    const sharedPath = path.resolve(rootDir, site.import.manifest);
    const loaded = await readManifest(sharedPath);
    if (!loaded) {
      throw new Error(`imported manifest not found: ${sharedPath}`);
    }
    shared = loaded;
    if (shared.gcpProjectId !== site.gcpProjectId) {
      throw new Error(
        `imported manifest ${sharedPath} uses gcpProjectId ` +
          `"${shared.gcpProjectId}" but the site uses "${site.gcpProjectId}"`
      );
    }
    const requested = resolveImportedNames(site.import, shared, sharedPath);
    for (const name of requested) {
      if (siteNames.has(name)) {
        throw new Error(
          `"${name}" is declared in both the site manifest and the imported ` +
            'shared manifest; remove it from one'
        );
      }
      const entry = shared.secrets[name];
      keys.push({
        name,
        gsmKey: shared.gsmKey,
        gcpProjectId: shared.gcpProjectId,
        updatedAt: entry.updatedAt,
      });
    }
  }

  return {rootDir, site, shared, keys};
}

function resolveImportedNames(
  config: ImportConfig,
  shared: Manifest,
  sharedPath: string
): string[] {
  if (!config.keys || config.keys === '*') {
    return Object.keys(shared.secrets);
  }
  for (const name of config.keys) {
    if (!Object.prototype.hasOwnProperty.call(shared.secrets, name)) {
      throw new Error(`imported key "${name}" is not defined in ${sharedPath}`);
    }
  }
  return config.keys;
}

function validateManifest(value: unknown, filePath: string): Manifest {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`invalid manifest ${filePath}: expected an object`);
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.gcpProjectId !== 'string' || !obj.gcpProjectId) {
    throw new Error(`invalid manifest ${filePath}: missing "gcpProjectId"`);
  }
  if (typeof obj.gsmKey !== 'string' || !GSM_KEY_RE.test(obj.gsmKey)) {
    throw new Error(
      `invalid manifest ${filePath}: "gsmKey" must match ${GSM_KEY_RE}`
    );
  }
  const secretsValue = obj.secrets ?? {};
  if (typeof secretsValue !== 'object' || secretsValue === null) {
    throw new Error(
      `invalid manifest ${filePath}: "secrets" must be an object`
    );
  }
  const secrets: Record<string, SecretEntry> = {};
  for (const [name, entry] of Object.entries(
    secretsValue as Record<string, unknown>
  )) {
    if (!ENV_NAME_RE.test(name)) {
      throw new Error(
        `invalid manifest ${filePath}: secret name "${name}" must match ${ENV_NAME_RE}`
      );
    }
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(
        `invalid manifest ${filePath}: secret "${name}" must be an object`
      );
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.updatedAt !== 'string' || !e.updatedAt) {
      throw new Error(
        `invalid manifest ${filePath}: secret "${name}" missing "updatedAt"`
      );
    }
    secrets[name] = {
      updatedAt: e.updatedAt,
      ...(typeof e.updatedBy === 'string' ? {updatedBy: e.updatedBy} : {}),
    };
  }

  let importConfig: ImportConfig | undefined;
  if (obj.import !== undefined) {
    if (typeof obj.import !== 'object' || obj.import === null) {
      throw new Error(
        `invalid manifest ${filePath}: "import" must be an object`
      );
    }
    const imp = obj.import as Record<string, unknown>;
    if (typeof imp.manifest !== 'string' || !imp.manifest) {
      throw new Error(
        `invalid manifest ${filePath}: "import.manifest" must be a path`
      );
    }
    let keys: string[] | '*' | undefined;
    if (imp.keys === '*' || imp.keys === undefined) {
      keys = imp.keys as '*' | undefined;
    } else if (Array.isArray(imp.keys)) {
      keys = imp.keys.map((k) => {
        if (typeof k !== 'string' || !ENV_NAME_RE.test(k)) {
          throw new Error(
            `invalid manifest ${filePath}: "import.keys" entries must match ${ENV_NAME_RE}`
          );
        }
        return k;
      });
    } else {
      throw new Error(
        `invalid manifest ${filePath}: "import.keys" must be an array or "*"`
      );
    }
    importConfig = {manifest: imp.manifest, ...(keys ? {keys} : {})};
  }

  return {
    version: typeof obj.version === 'number' ? obj.version : 1,
    gcpProjectId: obj.gcpProjectId,
    gsmKey: obj.gsmKey,
    ...(importConfig ? {import: importConfig} : {}),
    secrets,
  };
}
