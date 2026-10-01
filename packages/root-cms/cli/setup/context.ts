import {bold, cyan, dim, green, yellow} from 'kleur/colors';
import {GcpClient} from './gcp.js';
import {Prompter} from './prompter.js';

/** Values the wizard learns as it runs, filled in step by step. */
export interface SetupState {
  /** Active gcloud account email. */
  account?: string;
  gcpProjectId?: string;
  gcpProjectNumber?: string;
  /** CMS site id, stored under `Projects/{siteId}` in Firestore. */
  siteId?: string;
  /** Region for new Firestore databases and storage buckets. */
  location?: string;
  firebaseConfig?: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
  };
  /** Runtime service account email for the site. */
  serviceAccount?: string;
  /** Secret Manager key used by `root secrets`. */
  gsmKey?: string;
  /** Things done or skipped, for the final summary. */
  created: string[];
  reused: string[];
  todo: string[];
}

/** Shared dependencies and state passed to every setup step. */
export interface SetupContext {
  rootDir: string;
  gcp: GcpClient;
  prompt: Prompter;
  dryRun: boolean;
  state: SetupState;
  log: Logger;
}

export interface Logger {
  step(title: string): void;
  info(message: string): void;
  ok(message: string): void;
  warn(message: string): void;
}

export const consoleLogger: Logger = {
  step: (title) => console.log(`\n${bold(cyan('◆'))} ${bold(title)}`),
  info: (message) => console.log(`${dim('┃')} ${message}`),
  ok: (message) => console.log(`${dim('┃')} ${green('✓')} ${message}`),
  warn: (message) => console.log(`${dim('┃')} ${yellow('!')} ${message}`),
};

/**
 * Runs a change against Google Cloud or the local project. In dry-run mode
 * the change is only logged and `undefined` is returned.
 */
export async function mutate<T>(
  ctx: SetupContext,
  description: string,
  fn: () => Promise<T>
): Promise<T | undefined> {
  if (ctx.dryRun) {
    ctx.log.info(`${yellow('[dry run]')} would ${description}`);
    return undefined;
  }
  const result = await fn();
  ctx.log.ok(description);
  ctx.state.created.push(description);
  return result;
}

/** Records something that already existed and was left as is. */
export function reuse(ctx: SetupContext, description: string) {
  ctx.log.ok(`${description} ${dim('(already set up)')}`);
  ctx.state.reused.push(description);
}

/** Error that stops the wizard with a user-facing message. */
export class SetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SetupError';
  }
}
