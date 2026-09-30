import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {mutate, reuse, SetupContext} from './context.js';

/** Env var holding the session cookie secret, read in `root.config.ts`. */
export const COOKIE_SECRET_ENV = 'COOKIE_SECRET';

const MANIFEST_FILENAME = '.root.secrets.json';

/** Secret Manager key for a site. Prefixed with the site id for multitenancy. */
export function gsmKeyForSite(siteId: string): string {
  return `${siteId}-root-secrets`;
}

/**
 * Stores the site's secrets in Secret Manager with `root secrets`, which also
 * writes `.root.secrets.json` (commit it) and syncs values into `.env`.
 */
export async function setupSecrets(ctx: SetupContext) {
  ctx.log.step('Secrets');
  const projectId = ctx.state.gcpProjectId!;
  const gsmKey = gsmKeyForSite(ctx.state.siteId!);
  ctx.state.gsmKey = gsmKey;

  const manifest = await readManifest(ctx.rootDir);
  if (
    manifest &&
    (manifest.gsmKey !== gsmKey || manifest.gcpProjectId !== projectId)
  ) {
    // Don't repoint an existing manifest; that would orphan its secrets.
    ctx.log.warn(
      `${MANIFEST_FILENAME} already points at ${manifest.gcpProjectId}/${manifest.gsmKey}, so secrets stay there.`
    );
    ctx.state.gsmKey = manifest.gsmKey;
  } else if (manifest) {
    reuse(ctx, `${MANIFEST_FILENAME}`);
  } else {
    await mutate(
      ctx,
      `create ${MANIFEST_FILENAME} (Secret Manager key ${gsmKey})`,
      () =>
        runRoot(ctx, [
          'secrets',
          'init',
          '--gcp-project',
          projectId,
          '--gsm-key',
          gsmKey,
        ])
    );
  }

  if (manifest?.secrets?.[COOKIE_SECRET_ENV]) {
    reuse(ctx, COOKIE_SECRET_ENV);
  } else {
    const value = crypto.randomBytes(32).toString('base64url');
    // The value goes over stdin, never argv.
    await mutate(
      ctx,
      `store a generated ${COOKIE_SECRET_ENV} in Secret Manager`,
      () => runRoot(ctx, ['secrets', 'set', COOKIE_SECRET_ENV], value)
    );
  }

  await mutate(ctx, 'sync secrets into .env', () =>
    runRoot(ctx, ['secrets', 'sync'])
  );
}

async function readManifest(rootDir: string): Promise<any | null> {
  try {
    const raw = await fs.promises.readFile(
      path.join(rootDir, MANIFEST_FILENAME),
      'utf8'
    );
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Runs the project's own `root` CLI (installed with `@blinkk/root`). */
function runRoot(ctx: SetupContext, args: string[], input?: string) {
  // Run the bin script with node directly so it also works on Windows.
  const bin = path.join(
    ctx.rootDir,
    'node_modules',
    '@blinkk',
    'root',
    'bin',
    'root.js'
  );
  return ctx.gcp.exec(process.execPath, [bin, ...args], {
    cwd: ctx.rootDir,
    input,
  });
}
