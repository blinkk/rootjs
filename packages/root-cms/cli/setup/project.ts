import path from 'node:path';
import {mutate, reuse, SetupContext, SetupError} from './context.js';
import {gcloudJson, isGcpError} from './gcp.js';

const PROJECT_ID_RE = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const SITE_ID_RE = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$|^[a-z0-9]$/;

/** APIs the CMS and this wizard rely on. */
export const REQUIRED_APIS = [
  'cloudresourcemanager.googleapis.com',
  'firebase.googleapis.com',
  'firebaserules.googleapis.com',
  'firebasestorage.googleapis.com',
  'firestore.googleapis.com',
  'iam.googleapis.com',
  'identitytoolkit.googleapis.com',
  'secretmanager.googleapis.com',
  'serviceusage.googleapis.com',
  'storage.googleapis.com',
];

export function validateProjectId(value: string): string | undefined {
  if (!PROJECT_ID_RE.test(value)) {
    return 'Project ids are 6-30 characters: lowercase letters, digits and hyphens, starting with a letter.';
  }
  return undefined;
}

/**
 * Site ids become the Firestore doc `Projects/{siteId}`, the upload prefix in
 * GCS and the prefix of the site's Secret Manager key.
 */
export function validateSiteId(value: string): string | undefined {
  if (!SITE_ID_RE.test(value)) {
    return 'Site ids are 1-63 characters: lowercase letters, digits and hyphens, not starting or ending with a hyphen.';
  }
  return undefined;
}

/** Turns a directory name into something usable as an id. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Asks for a new or existing GCP project and makes sure billing is on. */
export async function chooseProject(
  ctx: SetupContext,
  options: {project?: string}
) {
  ctx.log.step('Google Cloud project');
  let projectId = options.project;
  let isNew = false;
  if (!projectId) {
    const mode = await ctx.prompt.select(
      'Create a new GCP project or use an existing one?',
      [
        {value: 'existing', label: 'Use an existing project'},
        {value: 'new', label: 'Create a new project'},
      ],
      'existing'
    );
    isNew = mode === 'new';
    if (isNew) {
      projectId = await ctx.prompt.text('New project id', {
        default: suggestProjectId(ctx.rootDir),
        validate: validateProjectId,
      });
    } else {
      projectId = await ctx.prompt.text('Existing project id', {
        validate: validateProjectId,
      });
    }
  }
  ctx.state.gcpProjectId = projectId;

  if (isNew) {
    await mutate(ctx, `create GCP project ${projectId}`, () =>
      ctx.gcp.gcloud(['projects', 'create', projectId!, '--name', projectId!])
    );
  }

  if (!(isNew && ctx.dryRun)) {
    try {
      const project = await gcloudJson(ctx.gcp, [
        'projects',
        'describe',
        projectId,
      ]);
      ctx.state.gcpProjectNumber = String(project.projectNumber);
    } catch (err) {
      if (
        isGcpError(err, 'NOT_FOUND') ||
        isGcpError(err, 'PERMISSION_DENIED')
      ) {
        throw new SetupError(
          `Project ${projectId} was not found, or ${ctx.state.account} can't access it.`
        );
      }
      throw err;
    }
    if (!isNew) {
      ctx.log.ok(`Using project ${projectId}`);
    }
  }

  await ensureBilling(ctx, isNew);
}

async function ensureBilling(ctx: SetupContext, isNew: boolean) {
  const projectId = ctx.state.gcpProjectId!;
  if (!(isNew && ctx.dryRun)) {
    const info = await gcloudJson(ctx.gcp, [
      'billing',
      'projects',
      'describe',
      projectId,
    ]);
    if (info?.billingEnabled) {
      reuse(ctx, 'Billing');
      return;
    }
  }
  ctx.log.info(
    'Secret Manager and the Firebase storage bucket need a billing account. Low-traffic sites usually stay in the free tier.'
  );
  const accounts: Array<{name: string; displayName: string}> =
    (await gcloudJson(ctx.gcp, [
      'billing',
      'accounts',
      'list',
      '--filter=open=true',
    ])) || [];
  if (accounts.length === 0) {
    throw new SetupError(
      `No open billing accounts found. Create one at https://console.cloud.google.com/billing/linkedaccount?project=${projectId}, then run this again.`
    );
  }
  const accountName = await ctx.prompt.select(
    'Which billing account should this project use?',
    accounts.map((a) => ({
      value: a.name,
      label: `${a.displayName} (${a.name.replace('billingAccounts/', '')})`,
    }))
  );
  const accountId = accountName.replace('billingAccounts/', '');
  await mutate(ctx, `link billing account ${accountId}`, () =>
    ctx.gcp.gcloud([
      'billing',
      'projects',
      'link',
      projectId,
      '--billing-account',
      accountId,
    ])
  );
}

/**
 * Asks for the site id. One GCP project can host several Root CMS sites, so
 * the id is always asked rather than assumed.
 */
export async function chooseSiteId(
  ctx: SetupContext,
  options: {siteId?: string; configSiteId?: string}
) {
  ctx.log.step('Site id');
  if (options.siteId) {
    const error = validateSiteId(options.siteId);
    if (error) {
      throw new SetupError(`--site-id: ${error}`);
    }
    ctx.state.siteId = options.siteId;
    return;
  }
  ctx.log.info(
    'A GCP project can host several Root CMS sites. The site id keeps this one separate: its content lives under Projects/<site id> in Firestore, its uploads under <site id>/ in storage, and its secrets under <site id>-root-secrets.'
  );
  const fallback = slugify(path.basename(ctx.rootDir)) || 'www';
  ctx.state.siteId = await ctx.prompt.text('Site id', {
    default:
      options.configSiteId && !validateSiteId(options.configSiteId)
        ? options.configSiteId
        : fallback,
    validate: validateSiteId,
  });
}

/** Enables any required APIs that aren't enabled yet. */
export async function enableApis(ctx: SetupContext, extra: string[] = []) {
  ctx.log.step('APIs');
  const projectId = ctx.state.gcpProjectId!;
  let enabled = new Set<string>();
  if (!ctx.dryRun || ctx.state.gcpProjectNumber) {
    const out = await ctx.gcp.gcloud([
      'services',
      'list',
      '--enabled',
      '--project',
      projectId,
      '--format=value(config.name)',
    ]);
    enabled = new Set(
      out
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }
  const missing = [...REQUIRED_APIS, ...extra].filter(
    (api) => !enabled.has(api)
  );
  if (missing.length === 0) {
    reuse(ctx, 'Required APIs');
    return;
  }
  await mutate(ctx, `enable ${missing.join(', ')}`, () =>
    ctx.gcp.gcloud(['services', 'enable', ...missing, '--project', projectId])
  );
}

function suggestProjectId(rootDir: string): string {
  const base = slugify(path.basename(rootDir)).slice(0, 24) || 'root';
  const id = `${base}-cms`.replace(/^[^a-z]+/, '');
  return validateProjectId(id) ? 'my-root-cms' : id;
}
