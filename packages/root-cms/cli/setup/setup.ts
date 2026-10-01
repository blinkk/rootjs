import {bold, dim, green, red} from 'kleur/colors';
import {readRootConfig, writeRootConfig} from './config.js';
import {
  consoleLogger,
  Logger,
  SetupContext,
  SetupError,
  SetupState,
} from './context.js';
import {setupAuth, setupFirebase} from './firebase.js';
import {
  checkSiteIdAvailable,
  setupFirestoreAccess,
  setupFirestoreDatabase,
} from './firestore.js';
import {GcloudClient, GcpClient, GcpError} from './gcp.js';
import {setupIam} from './iam.js';
import {checkAdcQuotaProject, checkGcloud} from './preflight.js';
import {chooseProject, chooseSiteId, enableApis} from './project.js';
import {Prompter, ReadlinePrompter} from './prompter.js';
import {setupSecrets} from './secrets.js';
import {setupStorage} from './storage.js';

export interface SetupOptions {
  /** GCP project id; skips the new/existing question. */
  project?: string;
  siteId?: string;
  /** Region for a new Firestore database and storage bucket. */
  location?: string;
  /** Print what would change without changing anything. */
  dryRun?: boolean;
  /** Accept the default answer to every question. */
  yes?: boolean;
}

/**
 * Runs every setup step in order. Each step checks what already exists and
 * skips it, so running the wizard again is safe.
 */
export async function runSetup(
  options: SetupOptions,
  deps: {rootDir: string; gcp: GcpClient; prompt: Prompter; log?: Logger}
): Promise<SetupState> {
  const state: SetupState = {
    location: options.location,
    created: [],
    reused: [],
    todo: [],
  };
  const ctx: SetupContext = {
    rootDir: deps.rootDir,
    gcp: deps.gcp,
    prompt: deps.prompt,
    dryRun: Boolean(options.dryRun),
    state,
    log: deps.log || consoleLogger,
  };
  const configInfo = await readRootConfig(ctx.rootDir);

  await checkGcloud(ctx);
  await chooseProject(ctx, {project: options.project});
  await chooseSiteId(ctx, {
    siteId: options.siteId,
    configSiteId: configInfo.siteId,
  });
  await enableApis(ctx);
  await checkAdcQuotaProject(ctx);
  await setupFirebase(ctx);
  await setupAuth(ctx);
  await setupFirestoreDatabase(ctx);
  await checkSiteIdAvailable(ctx);
  await setupFirestoreAccess(ctx);
  await setupStorage(ctx, {gci: configInfo.gci});
  await setupIam(ctx);
  await setupSecrets(ctx);
  await writeRootConfig(ctx, configInfo);
  printSummary(ctx);
  return state;
}

function printSummary(ctx: SetupContext) {
  const {state} = ctx;
  const projectId = state.gcpProjectId;
  console.log();
  console.log(
    bold(
      ctx.dryRun
        ? 'Dry run finished, nothing was changed.'
        : green('Google Cloud setup is done.')
    )
  );
  console.log(`${dim('┃')} project:          ${projectId}`);
  console.log(`${dim('┃')} site id:          ${state.siteId}`);
  if (state.serviceAccount) {
    console.log(`${dim('┃')} service account:  ${state.serviceAccount}`);
  }
  if (state.gsmKey) {
    console.log(`${dim('┃')} secrets:          ${state.gsmKey}`);
  }
  if (state.todo.length > 0) {
    console.log();
    console.log(bold('Still to do:'));
    for (const item of state.todo) {
      console.log(`  - ${item}`);
    }
  }
  console.log();
  console.log('Next:');
  console.log('  - Commit root.config.ts and .root.secrets.json.');
  console.log(
    `  - Deploy with the ${state.serviceAccount || 'site'} service account as the runtime identity.`
  );
  console.log('  - Run `pnpm dev` and open http://localhost:4007/cms/');
}

/** Action for `root-cms setup`. */
export async function setup(options: SetupOptions) {
  try {
    await runSetup(options, {
      rootDir: process.cwd(),
      gcp: new GcloudClient(),
      prompt: new ReadlinePrompter({yes: options.yes}),
    });
  } catch (err: any) {
    if (err instanceof SetupError || err instanceof GcpError) {
      console.error(`\n${red('✗')} ${err.message}`);
      console.error(
        dim(
          'Fix the issue and run `root-cms setup` again. Finished steps are skipped.'
        )
      );
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}
