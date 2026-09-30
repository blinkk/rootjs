import fs from 'node:fs';
import path from 'node:path';
import {mutate, SetupContext} from './context.js';
import {COOKIE_SECRET_ENV} from './secrets.js';

const CONFIG_FILENAMES = [
  'root.config.ts',
  'root.config.js',
  'root.config.mjs',
];

export interface RootConfigValues {
  siteId: string;
  firebaseConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
  };
}

export interface RootConfigUpdate {
  source: string;
  /** Keys that couldn't be found as string literals and weren't written. */
  missing: string[];
}

/** Settings read from an existing `root.config.ts`. */
export interface RootConfigInfo {
  filePath?: string;
  /** Existing cmsPlugin `id`, unless it's a template default. */
  siteId?: string;
  gci: boolean;
}

/** Finds the root config and reads the few settings the wizard needs. */
export async function readRootConfig(rootDir: string): Promise<RootConfigInfo> {
  const filePath = await findConfig(rootDir);
  if (!filePath) {
    return {gci: false};
  }
  const source = await fs.promises.readFile(filePath, 'utf8');
  const plugin = cmsPluginBody(source);
  const siteId = plugin ? matchString(plugin, 'id')?.value : undefined;
  return {
    filePath,
    siteId: siteId && siteId !== 'starter' ? siteId : undefined,
    gci: Boolean(plugin && /\bgci\s*:\s*(true|['"`])/.test(plugin)),
  };
}

/**
 * Fills the cmsPlugin `id` and `firebaseConfig` values in a root config and
 * points `sessionCookieSecret` at the `COOKIE_SECRET` env var. Only string
 * literals are replaced, so values already read from env vars are left alone.
 */
export function updateRootConfig(
  source: string,
  values: RootConfigValues
): RootConfigUpdate {
  const missing: string[] = [];
  const pluginStart = source.indexOf('cmsPlugin(');
  if (pluginStart === -1) {
    return {
      source,
      missing: ['id', 'apiKey', 'authDomain', 'projectId', 'storageBucket'],
    };
  }

  let result = source;
  const firebaseStart = result.indexOf('firebaseConfig', pluginStart);
  const replacements: Array<[string, string, number]> = [
    ['apiKey', values.firebaseConfig.apiKey, firebaseStart],
    ['authDomain', values.firebaseConfig.authDomain, firebaseStart],
    ['projectId', values.firebaseConfig.projectId, firebaseStart],
    ['storageBucket', values.firebaseConfig.storageBucket, firebaseStart],
    ['id', values.siteId, pluginStart],
  ];
  for (const [key, value, from] of replacements) {
    const match = from === -1 ? undefined : matchString(result, key, from);
    if (!match) {
      missing.push(key);
      continue;
    }
    result =
      result.slice(0, match.start) +
      `${match.quote}${escapeString(value, match.quote)}${match.quote}` +
      result.slice(match.end);
  }

  const cookie = matchString(result, 'sessionCookieSecret');
  if (cookie) {
    result =
      result.slice(0, cookie.start) +
      `process.env.${COOKIE_SECRET_ENV}` +
      result.slice(cookie.end);
  }
  return {source: result, missing};
}

/** Writes the new values into the project's root config. */
export async function writeRootConfig(ctx: SetupContext, info: RootConfigInfo) {
  ctx.log.step('root.config.ts');
  const values: RootConfigValues = {
    siteId: ctx.state.siteId!,
    firebaseConfig: ctx.state.firebaseConfig || {
      apiKey: 'YOUR_FIREBASE_API_KEY',
      authDomain: `${ctx.state.gcpProjectId}.firebaseapp.com`,
      projectId: ctx.state.gcpProjectId!,
      storageBucket: `${ctx.state.gcpProjectId}.firebasestorage.app`,
    },
  };
  if (!info.filePath) {
    printSnippet(ctx, values, 'No root.config.ts was found.');
    return;
  }
  const source = await fs.promises.readFile(info.filePath, 'utf8');
  const update = updateRootConfig(source, values);
  if (update.missing.length > 0) {
    printSnippet(
      ctx,
      values,
      `Couldn't find ${update.missing.join(', ')} in ${path.basename(info.filePath)}, so it wasn't changed.`
    );
    return;
  }
  if (update.source === source) {
    ctx.log.ok(`${path.basename(info.filePath)} is up to date`);
    return;
  }
  await mutate(ctx, `update ${path.basename(info.filePath)}`, () =>
    fs.promises.writeFile(info.filePath!, update.source, 'utf8')
  );
}

function printSnippet(
  ctx: SetupContext,
  values: RootConfigValues,
  reason: string
) {
  ctx.log.warn(`${reason} Add this to your cmsPlugin() options:`);
  const snippet = [
    `id: '${values.siteId}',`,
    'firebaseConfig: {',
    `  apiKey: '${values.firebaseConfig.apiKey}',`,
    `  authDomain: '${values.firebaseConfig.authDomain}',`,
    `  projectId: '${values.firebaseConfig.projectId}',`,
    `  storageBucket: '${values.firebaseConfig.storageBucket}',`,
    '},',
  ];
  for (const line of snippet) {
    ctx.log.info(`  ${line}`);
  }
  ctx.state.todo.push(
    'Add the cmsPlugin() config printed above to root.config.ts.'
  );
}

async function findConfig(rootDir: string): Promise<string | undefined> {
  for (const name of CONFIG_FILENAMES) {
    const filePath = path.join(rootDir, name);
    try {
      await fs.promises.access(filePath);
      return filePath;
    } catch {
      // Try the next name.
    }
  }
  return undefined;
}

function cmsPluginBody(source: string): string | undefined {
  const start = source.indexOf('cmsPlugin(');
  return start === -1 ? undefined : source.slice(start);
}

/** Finds `key: '<string>'` at or after `from` and returns the literal's span. */
function matchString(source: string, key: string, from = 0) {
  const re = new RegExp(
    `\\b${key}\\s*:\\s*(['"\`])((?:\\\\.|(?!\\1)[^\\\\])*)\\1`,
    'g'
  );
  re.lastIndex = from;
  const match = re.exec(source);
  if (!match) {
    return undefined;
  }
  const literal = match[0].slice(match[0].indexOf(match[1]));
  const start = match.index + match[0].length - literal.length;
  return {
    start,
    end: start + literal.length,
    quote: match[1],
    value: match[2],
  };
}

function escapeString(value: string, quote: string): string {
  return value.replace(/\\/g, '\\\\').split(quote).join(`\\${quote}`);
}
