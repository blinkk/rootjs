import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {fileExists} from '../utils/fsutils.js';
import {
  readEnvFile,
  parseEnv,
  upsertEnvVars,
  writeEnvFile,
} from './env-file.js';
import {accessSecretJson, writeSecretJson} from './gcloud.js';
import {hashValue, randomSalt} from './hash.js';
import {
  isValidEnvName,
  manifestPath,
  ManagedKey,
  readManifest,
  resolveManagedKeys,
  ResolvedSecrets,
  writeManifest,
} from './manifest.js';

/** Per-machine sync state filename, kept under `<rootDir>/.root/`. */
export const STATE_FILENAME = 'secrets-sync.json';

interface LocalStateEntry {
  /** ISO-8601 UTC timestamp last synced for this key. */
  updatedAt: string;
  /** Salted sha256 of the last value written to `.env`, for edit detection. */
  hash: string;
}

interface LocalState {
  /** Random per-file salt so hashes resist rainbow-table reversal. */
  salt: string;
  /** Map of managed env name to its last-synced metadata. */
  secrets: Record<string, LocalStateEntry>;
}

export interface SyncOptions {
  rootDir: string;
  /** When false, compute the result without writing `.env` or state. */
  apply: boolean;
  /** When true (pull), overwrite local values regardless of local edits. */
  force?: boolean;
}

export interface SyncResult {
  /** Keys whose remote value was written into `.env`. */
  changed: string[];
  /** Keys with a local override that was kept (no remote change). */
  kept: string[];
  /** Keys changed both remotely and locally; local kept, needs `pull`. */
  conflicts: string[];
  /** Keys whose pre-existing local value was replaced on first sync. */
  overwritten: string[];
  /** Keys removed from `.env` because they're no longer managed. */
  removed: string[];
  /** Per-gsmKey fetch failures; affected keys are left for the next run. */
  errors: Array<{gsmKey: string; message: string}>;
  /** Whether any network (gcloud) call was made. */
  ranNetwork: boolean;
}

/** Absolute path to the per-machine sync state file for a site. */
export function localStatePath(rootDir: string): string {
  return path.join(rootDir, '.root', STATE_FILENAME);
}

function envPath(rootDir: string): string {
  return path.join(rootDir, '.env');
}

// Dedupes concurrent default syncs for the same project (e.g. the dev-startup
// await racing the registered run). Only the apply-without-force path is memoed.
const inFlight = new Map<string, Promise<SyncResult>>();

/**
 * Three-way merges the manifest(s), Google Cloud Secret Manager values, and the
 * local `.env`, writing only managed keys and preserving everything else.
 *
 * For each managed key, "theirs" (the manifest `updatedAt`) and the local sync
 * state decide the outcome: take remote, keep a local override, flag a conflict,
 * or remove a no-longer-managed key. GSM is fetched at most once per gsmKey and
 * only when a key in that blob actually changed. Fetch failures are recorded and
 * skipped so they retry; this function never throws for network reasons.
 */
export function syncSecrets(options: SyncOptions): Promise<SyncResult> {
  const {rootDir, apply, force = false} = options;
  if (apply && !force) {
    const existing = inFlight.get(rootDir);
    if (existing) {
      return existing;
    }
    const promise = doSync(options).finally(() => inFlight.delete(rootDir));
    inFlight.set(rootDir, promise);
    return promise;
  }
  return doSync(options);
}

interface KeyPlan {
  key: ManagedKey;
  synced?: LocalStateEntry;
  envVal?: string;
  remoteChanged: boolean;
  localChanged: boolean;
}

async function doSync(options: SyncOptions): Promise<SyncResult> {
  const {rootDir, apply, force = false} = options;
  const result: SyncResult = {
    changed: [],
    kept: [],
    conflicts: [],
    overwritten: [],
    removed: [],
    errors: [],
    ranNetwork: false,
  };

  const resolved = await resolveManagedKeys(rootDir);
  if (!resolved) {
    return result;
  }

  const envFilePath = envPath(rootDir);
  const content = await readEnvFile(envFilePath);
  const parsed = parseEnv(content);
  const state = await readLocalState(rootDir);

  const plans: KeyPlan[] = resolved.keys.map((key) => {
    const synced = state.secrets[key.name];
    const envVal = parsed[key.name];
    const remoteChanged =
      force || !synced || key.updatedAt !== synced.updatedAt;
    const localChanged = synced
      ? hashValue(state.salt, envVal ?? '') !== synced.hash
      : envVal !== undefined;
    return {key, synced, envVal, remoteChanged, localChanged};
  });

  // A key needs its remote value fetched only when we intend to write "theirs".
  const needsTheirs = (plan: KeyPlan): boolean =>
    force || !plan.synced || (plan.remoteChanged && !plan.localChanged);

  // Fetch each required gsmKey blob at most once.
  const blobs = new Map<string, Record<string, string>>();
  const toFetch = new Map<string, string>(); // gsmKey -> project
  for (const plan of plans) {
    if (needsTheirs(plan)) {
      toFetch.set(plan.key.gsmKey, plan.key.gcpProjectId);
    }
  }
  for (const [gsmKey, project] of toFetch) {
    try {
      blobs.set(gsmKey, await accessSecretJson(gsmKey, project));
      result.ranNetwork = true;
    } catch (err: any) {
      result.errors.push({gsmKey, message: err?.message || String(err)});
    }
  }

  const updates: Record<string, string> = {};
  const nextState: LocalState = {salt: state.salt, secrets: {...state.secrets}};

  for (const plan of plans) {
    const name = plan.key.name;
    if (!needsTheirs(plan)) {
      if (plan.remoteChanged && plan.localChanged) {
        // Both sides moved: keep local, keep flagging until `pull` or a match.
        result.conflicts.push(name);
      } else if (!plan.remoteChanged && plan.localChanged) {
        // Intentional local override; leave it untouched.
        result.kept.push(name);
      }
      continue;
    }
    if (!blobs.has(plan.key.gsmKey)) {
      // Fetch failed; leave state untouched so it retries next run.
      continue;
    }
    const theirs = blobs.get(plan.key.gsmKey)![name];
    if (theirs === undefined) {
      // Declared in the manifest but no value stored yet; nothing to write.
      continue;
    }
    if (!plan.synced && plan.envVal !== undefined && plan.envVal !== theirs) {
      result.overwritten.push(name);
    }
    updates[name] = theirs;
    nextState.secrets[name] = {
      updatedAt: plan.key.updatedAt,
      hash: hashValue(state.salt, theirs),
    };
    result.changed.push(name);
  }

  // Keys recorded in state but no longer managed are removed from `.env`.
  const managed = new Set(resolved.keys.map((key) => key.name));
  const removals: string[] = [];
  for (const name of Object.keys(state.secrets)) {
    if (!managed.has(name)) {
      removals.push(name);
      delete nextState.secrets[name];
      result.removed.push(name);
    }
  }

  if (apply) {
    if (Object.keys(updates).length > 0 || removals.length > 0) {
      const next = upsertEnvVars(content, updates, removals);
      if (next !== content) {
        await writeEnvFile(envFilePath, next);
      }
      // Make changes live in the current process without a restart.
      for (const [name, value] of Object.entries(updates)) {
        process.env[name] = value;
      }
      for (const name of removals) {
        delete process.env[name];
      }
    }
    await writeLocalState(rootDir, nextState);
  }

  return result;
}

export interface SetSecretOptions {
  rootDir: string;
  /** Resolved path to the manifest the value belongs to (site or shared). */
  manifestFilePath: string;
  name: string;
  value: string;
  /** Defaults to `git config user.email`. */
  updatedBy?: string;
}

/**
 * Stores a value in GSM (read-modify-write of the gsmKey's JSON blob), records
 * its name + timestamp in the manifest, and updates the local `.env` and sync
 * state so the value is immediately usable.
 */
export async function setSecret(options: SetSecretOptions): Promise<void> {
  const {rootDir, manifestFilePath, name, value} = options;
  if (!isValidEnvName(name)) {
    throw new Error(`invalid secret name "${name}" (must match [A-Za-z0-9_]+)`);
  }
  const manifest = await readManifest(manifestFilePath);
  if (!manifest) {
    throw new Error(
      `no manifest at ${manifestFilePath}; run \`root secrets init\` first`
    );
  }

  const blob = await accessSecretJson(manifest.gsmKey, manifest.gcpProjectId);
  blob[name] = value;
  await writeSecretJson(manifest.gsmKey, manifest.gcpProjectId, blob);

  const updatedAt = new Date().toISOString();
  const updatedBy = options.updatedBy ?? (await getGitEmail());
  manifest.secrets[name] = {updatedAt, ...(updatedBy ? {updatedBy} : {})};
  await writeManifest(manifestFilePath, manifest);

  const envFilePath = envPath(rootDir);
  const content = await readEnvFile(envFilePath);
  const next = upsertEnvVars(content, {[name]: value});
  if (next !== content) {
    await writeEnvFile(envFilePath, next);
  }
  const state = await readLocalState(rootDir);
  state.secrets[name] = {updatedAt, hash: hashValue(state.salt, value)};
  await writeLocalState(rootDir, state);
}

export interface RemoveSecretOptions {
  rootDir: string;
  manifestFilePath: string;
  name: string;
}

/** Removes a secret from the manifest, its GSM blob, the local `.env`, and state. */
export async function removeSecret(
  options: RemoveSecretOptions
): Promise<void> {
  const {rootDir, manifestFilePath, name} = options;
  const manifest = await readManifest(manifestFilePath);
  if (!manifest) {
    throw new Error(`no manifest at ${manifestFilePath}`);
  }

  if (Object.prototype.hasOwnProperty.call(manifest.secrets, name)) {
    delete manifest.secrets[name];
    await writeManifest(manifestFilePath, manifest);
  }

  const blob = await accessSecretJson(manifest.gsmKey, manifest.gcpProjectId);
  if (Object.prototype.hasOwnProperty.call(blob, name)) {
    delete blob[name];
    await writeSecretJson(manifest.gsmKey, manifest.gcpProjectId, blob);
  }

  const envFilePath = envPath(rootDir);
  const content = await readEnvFile(envFilePath);
  const next = upsertEnvVars(content, {}, [name]);
  if (next !== content) {
    await writeEnvFile(envFilePath, next);
  }
  const state = await readLocalState(rootDir);
  if (state.secrets[name]) {
    delete state.secrets[name];
    await writeLocalState(rootDir, state);
  }
}

export type KeyStatusKind =
  | 'in-sync'
  | 'remote-newer'
  | 'locally-edited'
  | 'conflict'
  | 'not-pulled';

export interface KeyStatus {
  name: string;
  gsmKey: string;
  updatedAt: string;
  kind: KeyStatusKind;
  inEnv: boolean;
}

/**
 * Computes the sync status of every managed key WITHOUT any network access, by
 * comparing the manifest `updatedAt` and the local `.env` against the recorded
 * sync state. Used by `root secrets status`.
 */
export async function getSecretsStatus(
  rootDir: string
): Promise<{resolved: ResolvedSecrets | null; keys: KeyStatus[]}> {
  const resolved = await resolveManagedKeys(rootDir);
  if (!resolved) {
    return {resolved: null, keys: []};
  }
  const content = await readEnvFile(envPath(rootDir));
  const parsed = parseEnv(content);
  const state = await readLocalState(rootDir);
  const keys: KeyStatus[] = resolved.keys.map((key) => {
    const synced = state.secrets[key.name];
    const envVal = parsed[key.name];
    const remoteChanged = !synced || key.updatedAt !== synced.updatedAt;
    const localChanged = synced
      ? hashValue(state.salt, envVal ?? '') !== synced.hash
      : envVal !== undefined;
    let kind: KeyStatusKind;
    if (!synced) {
      kind = 'not-pulled';
    } else if (remoteChanged && localChanged) {
      kind = 'conflict';
    } else if (remoteChanged) {
      kind = 'remote-newer';
    } else if (localChanged) {
      kind = 'locally-edited';
    } else {
      kind = 'in-sync';
    }
    return {
      name: key.name,
      gsmKey: key.gsmKey,
      updatedAt: key.updatedAt,
      kind,
      inEnv: envVal !== undefined,
    };
  });
  return {resolved, keys};
}

/** True when a site has a manifest and sync isn't disabled via env var. */
export async function isSecretsSyncEnabled(rootDir: string): Promise<boolean> {
  if (isSyncDisabledByEnv()) {
    return false;
  }
  return fileExists(manifestPath(rootDir));
}

function isSyncDisabledByEnv(): boolean {
  const value = (process.env.ROOT_DISABLE_SECRETS_SYNC || '')
    .trim()
    .toLowerCase();
  return value !== '' && value !== '0' && value !== 'false';
}

async function readLocalState(rootDir: string): Promise<LocalState> {
  try {
    const raw = await fs.promises.readFile(localStatePath(rootDir), 'utf8');
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.salt === 'string' &&
      parsed.secrets &&
      typeof parsed.secrets === 'object'
    ) {
      return {
        salt: parsed.salt,
        secrets: parsed.secrets as Record<string, LocalStateEntry>,
      };
    }
  } catch {
    // Missing or corrupt state; start fresh with a new salt.
  }
  return {salt: randomSalt(), secrets: {}};
}

async function writeLocalState(
  rootDir: string,
  state: LocalState
): Promise<void> {
  const file = localStatePath(rootDir);
  await fs.promises.mkdir(path.dirname(file), {recursive: true});
  await fs.promises.writeFile(
    file,
    JSON.stringify(state, null, 2) + '\n',
    'utf8'
  );
}

/** Best-effort `git config user.email`; resolves undefined on any failure. */
function getGitEmail(): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      const child = spawn('git', ['config', 'user.email']);
      let out = '';
      child.stdout.on('data', (chunk) => {
        out += chunk.toString();
      });
      child.on('error', () => resolve(undefined));
      child.on('close', (code) => {
        resolve(code === 0 && out.trim() ? out.trim() : undefined);
      });
      child.stdin.end();
    } catch {
      resolve(undefined);
    }
  });
}
