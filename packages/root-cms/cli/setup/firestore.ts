import {FIRESTORE_RULES} from '../../core/security.js';
import {mutate, reuse, SetupContext} from './context.js';
import {gcloudJson, isGcpError} from './gcp.js';
import {validateSiteId} from './project.js';
import {applyRules} from './rules.js';

const FIRESTORE_API = 'https://firestore.googleapis.com/v1';

/** Creates the `(default)` Firestore database if it doesn't exist yet. */
export async function setupFirestoreDatabase(ctx: SetupContext) {
  ctx.log.step('Firestore');
  const projectId = ctx.state.gcpProjectId!;
  if (await databaseExists(ctx)) {
    reuse(ctx, 'Firestore database');
    return;
  }
  const location = await getLocation(ctx);
  await mutate(ctx, `create the Firestore database in ${location}`, () =>
    ctx.gcp.gcloud([
      'firestore',
      'databases',
      'create',
      '--database=(default)',
      `--location=${location}`,
      '--type=firestore-native',
      '--project',
      projectId,
    ])
  );
}

/**
 * Makes sure the site id isn't already used by another site on this project.
 * If `Projects/{siteId}` exists and the user isn't a member, they can either
 * join it or pick a different id.
 */
export async function checkSiteIdAvailable(ctx: SetupContext) {
  if (ctx.dryRun && !(await databaseExists(ctx))) {
    return;
  }
  for (;;) {
    const doc = await getSiteDoc(ctx);
    if (!doc) {
      ctx.log.ok(`Site id "${ctx.state.siteId}" is new on this project`);
      return;
    }
    const roles = readRoles(doc);
    if (roles[ctx.state.account!]) {
      reuse(ctx, `Site "${ctx.state.siteId}"`);
      return;
    }
    const memberCount = Object.keys(roles).length;
    ctx.log.warn(
      `A site with id "${ctx.state.siteId}" already exists on ${ctx.state.gcpProjectId} (${memberCount} member${memberCount === 1 ? '' : 's'}) and you're not one of them.`
    );
    const join = await ctx.prompt.confirm(
      'Use this existing site anyway (you will be added as an admin)?',
      false
    );
    if (join) {
      return;
    }
    ctx.state.siteId = await ctx.prompt.text('Pick a different site id', {
      validate: validateSiteId,
    });
  }
}

/** Releases the Root CMS Firestore rules and adds the user as a site admin. */
export async function setupFirestoreAccess(ctx: SetupContext) {
  const projectId = ctx.state.gcpProjectId!;
  await applyRules(ctx, {
    label: 'Firestore security rules',
    releaseId: 'cloud.firestore',
    fileName: 'firestore.rules',
    source: FIRESTORE_RULES,
    consoleUrl: `https://console.firebase.google.com/project/${projectId}/firestore/rules`,
  });

  const email = ctx.state.account!;
  const doc =
    ctx.dryRun && !(await databaseExists(ctx)) ? null : await getSiteDoc(ctx);
  const roles = doc ? readRoles(doc) : {};
  if (roles[email] === 'ADMIN') {
    reuse(ctx, `${email} as ADMIN of site "${ctx.state.siteId}"`);
    return;
  }
  roles[email] = 'ADMIN';
  await mutate(ctx, `add ${email} as ADMIN of site "${ctx.state.siteId}"`, () =>
    ctx.gcp.request({
      method: 'PATCH',
      // Only the roles field is written so other site settings are kept.
      url: `${siteDocUrl(ctx)}?updateMask.fieldPaths=roles`,
      body: {fields: {roles: toRolesValue(roles)}},
      quotaProject: projectId,
    })
  );
}

async function databaseExists(ctx: SetupContext): Promise<boolean> {
  if (!ctx.state.gcpProjectNumber) {
    return false;
  }
  try {
    await gcloudJson(ctx.gcp, [
      'firestore',
      'databases',
      'describe',
      '--database=(default)',
      '--project',
      ctx.state.gcpProjectId!,
    ]);
    return true;
  } catch (err) {
    if (isGcpError(err, 'NOT_FOUND')) {
      return false;
    }
    throw err;
  }
}

async function getLocation(ctx: SetupContext): Promise<string> {
  if (!ctx.state.location) {
    ctx.state.location = await ctx.prompt.text(
      'Region for Firestore and storage (see https://firebase.google.com/docs/firestore/locations)',
      {default: 'us-central1'}
    );
  }
  return ctx.state.location;
}

function siteDocUrl(ctx: SetupContext): string {
  const projectId = ctx.state.gcpProjectId!;
  const siteId = encodeURIComponent(ctx.state.siteId!);
  return `${FIRESTORE_API}/projects/${projectId}/databases/(default)/documents/Projects/${siteId}`;
}

async function getSiteDoc(ctx: SetupContext): Promise<any | null> {
  try {
    return await ctx.gcp.request({
      url: siteDocUrl(ctx),
      quotaProject: ctx.state.gcpProjectId,
    });
  } catch (err) {
    if (isGcpError(err, 'NOT_FOUND')) {
      return null;
    }
    throw err;
  }
}

/** Reads the `roles` map from a Firestore REST document. */
export function readRoles(doc: any): Record<string, string> {
  const fields = doc?.fields?.roles?.mapValue?.fields || {};
  const roles: Record<string, string> = {};
  for (const [email, value] of Object.entries<any>(fields)) {
    if (typeof value?.stringValue === 'string') {
      roles[email] = value.stringValue;
    }
  }
  return roles;
}

function toRolesValue(roles: Record<string, string>) {
  const fields: Record<string, {stringValue: string}> = {};
  for (const [email, role] of Object.entries(roles)) {
    fields[email] = {stringValue: role};
  }
  return {mapValue: {fields}};
}
