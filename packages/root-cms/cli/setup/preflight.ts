import {SetupContext, SetupError} from './context.js';
import {GcpError, isGcpError} from './gcp.js';

/**
 * Verifies that gcloud is installed and that both the gcloud CLI and
 * Application Default Credentials (used by firebase-admin) are signed in,
 * offering to run the login commands when they aren't.
 */
export async function checkGcloud(ctx: SetupContext) {
  ctx.log.step('Checking gcloud');
  try {
    await ctx.gcp.gcloud(['version']);
  } catch (err) {
    if (isGcpError(err, 'ENOENT')) {
      throw new SetupError((err as GcpError).message);
    }
    throw err;
  }
  ctx.log.ok('gcloud is installed');

  let account = await getActiveAccount(ctx);
  if (!account) {
    ctx.log.warn('gcloud is not signed in.');
    const login = await ctx.prompt.confirm(
      'Run `gcloud auth login` now?',
      true
    );
    if (!login) {
      throw new SetupError('Run `gcloud auth login`, then run this again.');
    }
    await ctx.gcp.gcloudInteractive(['auth', 'login']);
    account = await getActiveAccount(ctx);
    if (!account) {
      throw new SetupError('gcloud is still not signed in.');
    }
  }
  ctx.state.account = account;
  ctx.log.ok(`gcloud is signed in as ${account}`);

  let adcAccount = await getAdcAccount(ctx);
  if (adcAccount === null) {
    ctx.log.warn(
      'Application Default Credentials are not set up. Root CMS uses them to talk to Firestore locally.'
    );
    const login = await ctx.prompt.confirm(
      'Run `gcloud auth application-default login` now?',
      true
    );
    if (!login) {
      throw new SetupError(
        'Run `gcloud auth application-default login`, then run this again.'
      );
    }
    await ctx.gcp.gcloudInteractive(['auth', 'application-default', 'login']);
    adcAccount = await getAdcAccount(ctx);
    if (adcAccount === null) {
      throw new SetupError(
        'Application Default Credentials are still missing.'
      );
    }
  }
  if (adcAccount && adcAccount !== account) {
    ctx.log.warn(
      `Application Default Credentials use ${adcAccount}, but gcloud uses ${account}. ` +
        'Run `gcloud auth application-default login` with the same account if the CMS gets permission errors.'
    );
  } else {
    ctx.log.ok('Application Default Credentials are set up');
  }
}

/**
 * Points the ADC quota project at the site's GCP project, which avoids
 * PERMISSION_DENIED errors from Firestore when using user credentials. This
 * only changes the local credentials file.
 */
export async function checkAdcQuotaProject(ctx: SetupContext) {
  const projectId = ctx.state.gcpProjectId!;
  const current = await ctx.gcp.getAdcQuotaProject();
  if (current === projectId) {
    return;
  }
  const ok = await ctx.prompt.confirm(
    `Set the Application Default Credentials quota project to ${projectId}? (recommended)`,
    true
  );
  if (!ok) {
    ctx.state.todo.push(
      `If Firestore returns PERMISSION_DENIED locally, run \`gcloud auth application-default set-quota-project ${projectId}\`.`
    );
    return;
  }
  if (ctx.dryRun) {
    ctx.log.info(`[dry run] would set the ADC quota project to ${projectId}`);
    return;
  }
  try {
    await ctx.gcp.gcloud([
      'auth',
      'application-default',
      'set-quota-project',
      projectId,
    ]);
    ctx.log.ok(`ADC quota project set to ${projectId}`);
  } catch (err: any) {
    // Needs serviceusage.services.use, which may not be granted yet on a
    // brand-new project. Not fatal.
    ctx.log.warn(`Could not set the ADC quota project: ${err.message}`);
    ctx.state.todo.push(
      `Run \`gcloud auth application-default set-quota-project ${projectId}\`.`
    );
  }
}

async function getActiveAccount(ctx: SetupContext): Promise<string> {
  const out = await ctx.gcp.gcloud([
    'auth',
    'list',
    '--filter=status:ACTIVE',
    '--format=value(account)',
  ]);
  return out.trim().split('\n')[0]?.trim() || '';
}

/**
 * Returns the ADC account email, `''` if ADC works but the email isn't
 * known, or `null` if ADC isn't set up.
 */
async function getAdcAccount(ctx: SetupContext): Promise<string | null> {
  let token: string;
  try {
    token = (
      await ctx.gcp.gcloud([
        'auth',
        'application-default',
        'print-access-token',
      ])
    ).trim();
  } catch {
    return null;
  }
  if (!token) {
    return null;
  }
  try {
    const info = JSON.parse(
      await ctx.gcp.fetchText(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`
      )
    );
    return info.email || '';
  } catch {
    return '';
  }
}
