import {bold} from 'kleur/colors';
import {mutate, reuse, SetupContext, SetupError} from './context.js';
import {GcpClient, isGcpError} from './gcp.js';

const FIREBASE_API = 'https://firebase.googleapis.com/v1beta1';
const IDENTITY_TOOLKIT_API = 'https://identitytoolkit.googleapis.com/v2';

const WEB_APP_NAME = 'Root CMS';

/**
 * Adds Firebase to the GCP project if needed and reads the web app config
 * (`apiKey`, `authDomain`, `storageBucket`) that the CMS UI uses.
 */
export async function setupFirebase(ctx: SetupContext) {
  ctx.log.step('Firebase');
  const projectId = ctx.state.gcpProjectId!;
  const quotaProject = projectId;

  let isFirebaseProject = false;
  if (ctx.state.gcpProjectNumber) {
    try {
      await ctx.gcp.request({
        url: `${FIREBASE_API}/projects/${projectId}`,
        quotaProject,
      });
      isFirebaseProject = true;
    } catch (err) {
      if (
        !isGcpError(err, 'NOT_FOUND') &&
        !isGcpError(err, 'PERMISSION_DENIED')
      ) {
        throw err;
      }
    }
  }
  if (isFirebaseProject) {
    reuse(ctx, 'Firebase project');
  } else {
    const done = await mutate(ctx, 'add Firebase to the project', async () => {
      const op = await ctx.gcp.request({
        method: 'POST',
        url: `${FIREBASE_API}/projects/${projectId}:addFirebase`,
        body: {},
        quotaProject,
      });
      await waitForOperation(ctx.gcp, FIREBASE_API, op, quotaProject);
      return true;
    });
    if (!done) {
      return;
    }
  }

  const list = await ctx.gcp.request<{
    apps?: Array<{appId: string; displayName?: string; state?: string}>;
  }>({
    url: `${FIREBASE_API}/projects/${projectId}/webApps`,
    quotaProject,
  });
  const apps = (list.apps || []).filter((app) => app.state !== 'DELETED');
  // The web app config is project-wide, so any existing web app works, even
  // one another site on this project created.
  let appId =
    apps.find((app) => app.displayName === WEB_APP_NAME)?.appId ||
    apps[0]?.appId;
  if (appId) {
    reuse(ctx, 'Firebase web app');
  } else {
    appId = await mutate(
      ctx,
      `create the "${WEB_APP_NAME}" Firebase web app`,
      async () => {
        const op = await ctx.gcp.request({
          method: 'POST',
          url: `${FIREBASE_API}/projects/${projectId}/webApps`,
          body: {displayName: WEB_APP_NAME},
          quotaProject,
        });
        const result = await waitForOperation(
          ctx.gcp,
          FIREBASE_API,
          op,
          quotaProject
        );
        return result?.appId as string;
      }
    );
    if (!appId) {
      return;
    }
  }

  const config = await ctx.gcp.request({
    url: `${FIREBASE_API}/projects/${projectId}/webApps/${appId}/config`,
    quotaProject,
  });
  if (!config?.apiKey) {
    throw new SetupError(
      `The Firebase web app config for ${projectId} has no apiKey. Check it at https://console.firebase.google.com/project/${projectId}/settings/general`
    );
  }
  ctx.state.firebaseConfig = {
    apiKey: config.apiKey,
    authDomain: config.authDomain || `${projectId}.firebaseapp.com`,
    projectId: config.projectId || projectId,
    storageBucket: config.storageBucket || '',
  };
}

/**
 * Makes sure Google sign-in is enabled for Firebase Auth. Turning it on needs
 * an OAuth client, which Google has no public API to create, so the user
 * flips one switch in the Firebase console and the wizard verifies it.
 */
export async function setupAuth(ctx: SetupContext) {
  ctx.log.step('Google sign-in');
  const projectId = ctx.state.gcpProjectId!;
  if (ctx.dryRun && !ctx.state.firebaseConfig) {
    ctx.log.info('[dry run] would check that Google sign-in is enabled');
    return;
  }
  if (await isGoogleSignInEnabled(ctx)) {
    reuse(ctx, 'Google sign-in');
    return;
  }

  const url = `https://console.firebase.google.com/project/${projectId}/authentication/providers`;
  ctx.log.info('Google sign-in needs one manual step in the Firebase console:');
  ctx.log.info('');
  ctx.log.info(`  1. Open ${bold(url)}`);
  ctx.log.info('  2. If you see "Get started", click it.');
  ctx.log.info(
    '  3. Click "Google", turn on "Enable", pick a support email and click "Save".'
  );
  ctx.log.info('');
  ctx.log.info('Firebase creates the OAuth client for you.');

  if (ctx.dryRun) {
    ctx.state.todo.push(`Enable Google sign-in at ${url}`);
    return;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    await ctx.prompt.pause("Press enter when that's done...");
    if (await isGoogleSignInEnabled(ctx)) {
      ctx.log.ok('Google sign-in is enabled');
      return;
    }
    ctx.log.warn(
      'Google sign-in still looks off (it can take a few seconds to show up).'
    );
    const retry = await ctx.prompt.confirm('Check again?', true);
    if (!retry) {
      break;
    }
  }
  ctx.state.todo.push(`Enable Google sign-in at ${url}`);
}

async function isGoogleSignInEnabled(ctx: SetupContext): Promise<boolean> {
  const projectId = ctx.state.gcpProjectId!;
  try {
    const idp = await ctx.gcp.request({
      url: `${IDENTITY_TOOLKIT_API}/projects/${projectId}/defaultSupportedIdpConfigs/google.com`,
      quotaProject: projectId,
    });
    return Boolean(idp?.enabled);
  } catch (err) {
    // Auth hasn't been initialized or the provider isn't configured yet.
    if (isGcpError(err, 'NOT_FOUND') || isGcpError(err, 'UNKNOWN')) {
      return false;
    }
    throw err;
  }
}

/** Polls a long-running operation until it's done and returns its response. */
export async function waitForOperation(
  gcp: GcpClient,
  baseUrl: string,
  op: {name?: string; done?: boolean; response?: any; error?: any},
  quotaProject?: string,
  options: {intervalMs?: number; timeoutMs?: number} = {}
): Promise<any> {
  const intervalMs = options.intervalMs ?? 2000;
  const deadline = Date.now() + (options.timeoutMs ?? 5 * 60 * 1000);
  let current = op;
  while (!current.done) {
    if (!current.name) {
      return current.response;
    }
    if (Date.now() > deadline) {
      throw new SetupError(`Timed out waiting for ${current.name}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    current = await gcp.request({
      url: `${baseUrl}/${current.name}`,
      quotaProject,
    });
  }
  if (current.error) {
    throw new SetupError(
      `${current.name || 'operation'} failed: ${current.error.message || JSON.stringify(current.error)}`
    );
  }
  return current.response;
}
