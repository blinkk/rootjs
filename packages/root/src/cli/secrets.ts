import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as readline from 'node:readline';

import {Command} from 'commander';
import {dim, green, red, yellow} from 'kleur/colors';

import {
  emptyManifest,
  ImportConfig,
  manifestPath,
  MANIFEST_FILENAME,
  readManifest,
  writeManifest,
} from '../secrets/manifest.js';
import {
  getSecretsStatus,
  isSecretsSyncEnabled,
  KeyStatus,
  removeSecret,
  setSecret,
  syncSecrets,
  SyncResult,
} from '../secrets/secrets.js';

const BAR = dim('┃');
const DEV_SYNC_TIMEOUT_MS = 10000;

/** Registers the `root secrets …` command group. */
export function registerSecretsCommands(program: Command) {
  const secrets = program
    .command('secrets')
    .description(
      'manage shared secrets backed by Google Cloud Secret Manager (requires the gcloud CLI)'
    );

  secrets
    .command('init')
    .description('create a secrets manifest')
    .requiredOption('--gcp-project <id>', 'GCP project id')
    .requiredOption('--gsm-key <key>', 'Secret Manager key for this manifest')
    .option(
      '--manifest <path>',
      'manifest path (defaults to ./.root.secrets.json)'
    )
    .option('--import <path>', 'path to a shared manifest to import keys from')
    .option(
      '--import-keys <names>',
      'comma-separated subset of shared keys to import'
    )
    .action(action(secretsInit));

  secrets
    .command('set <name>')
    .description(
      'store a secret value, read from a prompt (TTY) or piped stdin'
    )
    .option(
      '--manifest <path>',
      'target manifest (defaults to ./.root.secrets.json)'
    )
    .action(action(secretsSet));

  secrets
    .command('rm <name>')
    .description('remove a secret')
    .option(
      '--manifest <path>',
      'target manifest (defaults to ./.root.secrets.json)'
    )
    .action(action(secretsRm));

  secrets
    .command('sync')
    .description('three-way merge managed secrets into .env')
    .action(action(secretsSync));

  secrets
    .command('pull')
    .description(
      'force-download managed secrets into .env (overwrites local edits)'
    )
    .action(action(secretsPull));

  secrets
    .command('status')
    .description('show managed secrets and their sync status (no network)')
    .action(action(secretsStatus));
}

interface InitOptions {
  gcpProject: string;
  gsmKey: string;
  manifest?: string;
  import?: string;
  importKeys?: string;
}

async function secretsInit(opts: InitOptions) {
  const rootDir = process.cwd();
  const target = opts.manifest
    ? path.resolve(rootDir, opts.manifest)
    : manifestPath(rootDir);

  if (await readManifest(target)) {
    console.log(
      `${BAR} ${yellow('secrets:')} manifest already exists at ${rel(rootDir, target)}`
    );
    return;
  }

  const manifest = emptyManifest(opts.gcpProject, opts.gsmKey);
  if (opts.import) {
    const importConfig: ImportConfig = {manifest: opts.import};
    if (opts.importKeys) {
      const keys = opts.importKeys
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      if (keys.length > 0) {
        importConfig.keys = keys;
      }
    }
    manifest.import = importConfig;
  }
  await writeManifest(target, manifest);

  const addedGitignore = await ensureRootGitignored(rootDir);
  console.log();
  console.log(`${BAR} ${green('secrets:')} created ${rel(rootDir, target)}`);
  if (addedGitignore) {
    console.log(`${BAR}   added ${dim('.root/')} to .gitignore`);
  }
  await warnIfEnvNotIgnored(rootDir);
  console.log(
    `${BAR}   ${dim('next: `root secrets set <NAME>` to store a value')}`
  );
  console.log();
}

interface SetOptions {
  manifest?: string;
}

async function secretsSet(name: string, opts: SetOptions) {
  const rootDir = process.cwd();
  const manifestFilePath = opts.manifest
    ? path.resolve(rootDir, opts.manifest)
    : manifestPath(rootDir);

  // The value is only ever read from stdin (a masked prompt on a TTY, or piped
  // input) so it never appears in argv, shell history, or the process list.
  const secretValue = await readSecretValue(name);
  if (!secretValue) {
    throw new Error('no value provided on stdin');
  }

  await setSecret({rootDir, manifestFilePath, name, value: secretValue});
  console.log(`${BAR} ${green('secrets:')} set ${name}`);
  console.log(
    `${BAR}   ${dim(`commit ${rel(rootDir, manifestFilePath)} to share this change`)}`
  );
}

async function secretsRm(name: string, opts: {manifest?: string}) {
  const rootDir = process.cwd();
  const manifestFilePath = opts.manifest
    ? path.resolve(rootDir, opts.manifest)
    : manifestPath(rootDir);
  await removeSecret({rootDir, manifestFilePath, name});
  console.log(`${BAR} ${green('secrets:')} removed ${name}`);
  console.log(
    `${BAR}   ${dim(`commit ${rel(rootDir, manifestFilePath)} to share this change`)}`
  );
}

async function secretsSync() {
  const rootDir = process.cwd();
  const result = await syncSecrets({rootDir, apply: true});
  printSyncSummary(result);
}

async function secretsPull() {
  const rootDir = process.cwd();
  const result = await syncSecrets({rootDir, apply: true, force: true});
  printSyncSummary(result, {pull: true});
}

async function secretsStatus() {
  const rootDir = process.cwd();
  const {resolved, keys} = await getSecretsStatus(rootDir);
  if (!resolved) {
    console.log(
      `${BAR} ${yellow('secrets:')} no ${MANIFEST_FILENAME} here; run \`root secrets init\``
    );
    return;
  }
  console.log();
  console.log(
    `${BAR} ${green('secrets:')} ${resolved.site.gsmKey} ${dim(`(${resolved.site.gcpProjectId})`)}`
  );
  if (resolved.shared) {
    console.log(`${BAR}   imports ${dim(resolved.shared.gsmKey)}`);
  }
  if (keys.length === 0) {
    console.log(`${BAR}   ${dim('no managed keys yet')}`);
  }
  for (const key of keys) {
    console.log(`${BAR}   ${formatStatus(key)}`);
  }
  console.log();
}

/**
 * Runs a blocking secrets sync at the start of `root dev` so managed values are
 * live before the server starts. Never throws and never blocks longer than
 * {@link DEV_SYNC_TIMEOUT_MS}; failures degrade to a notice so dev still starts.
 */
export async function syncSecretsOnDev(rootDir: string): Promise<void> {
  if (!(await isSecretsSyncEnabled(rootDir))) {
    return;
  }
  try {
    const result = await withTimeout(
      syncSecrets({rootDir, apply: true}),
      DEV_SYNC_TIMEOUT_MS
    );
    printSyncSummary(result, {dev: true});
  } catch (err: any) {
    console.log();
    console.log(
      `${BAR} ${yellow('secrets:')} sync skipped (${firstLine(err?.message || String(err))})`
    );
    console.log();
  }
}

function formatStatus(key: KeyStatus): string {
  switch (key.kind) {
    case 'in-sync':
      return `${green('✓')} ${key.name}`;
    case 'remote-newer':
      return `${yellow('↓')} ${key.name} ${dim('(update available — run `root secrets sync`)')}`;
    case 'locally-edited':
      return `${dim('•')} ${key.name} ${dim('(locally edited)')}`;
    case 'conflict':
      return `${yellow('!')} ${key.name} ${dim('(changed locally & remotely)')}`;
    case 'not-pulled':
      return `${yellow('↓')} ${key.name} ${dim('(not pulled yet)')}`;
    default:
      return key.name;
  }
}

function printSyncSummary(
  result: SyncResult,
  opts: {dev?: boolean; pull?: boolean} = {}
) {
  const notable =
    result.changed.length > 0 ||
    result.removed.length > 0 ||
    result.conflicts.length > 0 ||
    result.overwritten.length > 0 ||
    result.errors.length > 0;
  // During `root dev`, stay quiet unless something noteworthy happened.
  if (opts.dev && !notable) {
    return;
  }

  const parts: string[] = [];
  if (result.changed.length) {
    parts.push(green(`${result.changed.length} updated`));
  }
  if (result.removed.length) {
    parts.push(`${result.removed.length} removed`);
  }
  if (result.kept.length) {
    parts.push(dim(`${result.kept.length} local`));
  }
  if (result.conflicts.length) {
    parts.push(yellow(`${result.conflicts.length} conflict`));
  }

  console.log();
  console.log(
    `${BAR} ${green('secrets:')} ${parts.length ? parts.join(', ') : 'up to date'}`
  );
  for (const name of result.changed) {
    console.log(`${BAR}   ${green('+')} ${name}`);
  }
  for (const name of result.removed) {
    console.log(`${BAR}   ${dim('-')} ${name} ${dim('(removed)')}`);
  }
  for (const name of result.overwritten) {
    console.log(
      `${BAR}   ${yellow('!')} ${name} ${dim('(local value replaced)')}`
    );
  }
  for (const name of result.conflicts) {
    console.log(
      `${BAR}   ${yellow('!')} ${name} ${dim(
        '(changed locally & remotely; keeping yours — `root secrets pull` to take remote)'
      )}`
    );
  }
  for (const err of result.errors) {
    console.log(
      `${BAR}   ${red('×')} ${err.gsmKey}: ${firstLine(err.message)}`
    );
  }
  console.log();
}

/** Ensures `.root/` is git-ignored; returns true if it added the entry. */
async function ensureRootGitignored(rootDir: string): Promise<boolean> {
  const gitignore = path.join(rootDir, '.gitignore');
  let content = '';
  try {
    content = await fs.promises.readFile(gitignore, 'utf8');
  } catch {
    // No .gitignore yet; we'll create one.
  }
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes('.root/') || lines.includes('.root')) {
    return false;
  }
  const prefix = content && !content.endsWith('\n') ? '\n' : '';
  await fs.promises.writeFile(gitignore, `${content}${prefix}.root/\n`, 'utf8');
  return true;
}

/** Warns (best-effort) if `.env` is not git-ignored. */
async function warnIfEnvNotIgnored(rootDir: string): Promise<void> {
  const ignored = await isPathGitIgnored(rootDir, '.env');
  if (ignored === false) {
    console.log(
      `${BAR}   ${yellow('warning:')} ${dim('.env is not git-ignored — add it to .gitignore')}`
    );
  }
}

/** Returns true/false if known, or undefined if git can't answer. */
function isPathGitIgnored(
  rootDir: string,
  relPath: string
): Promise<boolean | undefined> {
  return new Promise((resolve) => {
    try {
      const child = spawn('git', ['check-ignore', '--quiet', relPath], {
        cwd: rootDir,
      });
      child.on('error', () => resolve(undefined));
      child.on('close', (code) => {
        // 0 = ignored, 1 = not ignored, 128 = not a git repo / other.
        if (code === 0) {
          resolve(true);
        } else if (code === 1) {
          resolve(false);
        } else {
          resolve(undefined);
        }
      });
    } catch {
      resolve(undefined);
    }
  });
}

/**
 * Reads the secret value from stdin only — a masked prompt when attached to a
 * TTY, otherwise the piped input — so the value never reaches argv.
 */
function readSecretValue(name: string): Promise<string> {
  if (process.stdin.isTTY) {
    return promptSecret(`Value for ${name}: `);
  }
  return readStdin().then(stripOneTrailingNewline);
}

/** Reads all of stdin as a UTF-8 string. */
function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/** Strips a single trailing newline so `echo value | root secrets set` works. */
function stripOneTrailingNewline(value: string): string {
  return value.replace(/\r?\n$/, '');
}

/** Prompts for a secret value, masking the typed characters on a TTY. */
function promptSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    let muted = false;
    const rlAny = rl as any;
    rlAny._writeToOutput = (chunk: string) => {
      if (!muted) {
        rlAny.output.write(chunk);
      } else if (chunk.includes('\n') || chunk.includes('\r')) {
        rlAny.output.write('\n');
      }
      // Swallow echoed value characters while muted.
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
    muted = true;
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function rel(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath) || path.basename(filePath);
}

function firstLine(text: string): string {
  return String(text).split('\n')[0];
}

/** Wraps a command action to print friendly errors and set a failing exit code. */
function action<A extends any[]>(fn: (...args: A) => Promise<void>) {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (err: any) {
      console.error(`${red('error:')} ${err?.message || err}`);
      process.exitCode = 1;
    }
  };
}
