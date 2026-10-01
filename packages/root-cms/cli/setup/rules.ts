import {mutate, reuse, SetupContext} from './context.js';
import {isGcpError} from './gcp.js';

const RULES_API = 'https://firebaserules.googleapis.com/v1';

export interface ApplyRulesOptions {
  /** Human-readable name, e.g. "Firestore security rules". */
  label: string;
  /** Release id, e.g. `cloud.firestore` or `firebase.storage/<bucket>`. */
  releaseId: string;
  /** Filename recorded in the ruleset, e.g. `firestore.rules`. */
  fileName: string;
  source: string;
  /** Console URL where the user can review the live rules. */
  consoleUrl: string;
}

/**
 * Releases `source` as the project's rules. Rules shared by every site on the
 * project are only replaced without asking when none are released yet; if
 * different rules are live, the user confirms first.
 */
export async function applyRules(
  ctx: SetupContext,
  options: ApplyRulesOptions
) {
  const projectId = ctx.state.gcpProjectId!;
  const releaseName = `projects/${projectId}/releases/${options.releaseId}`;
  const current = await getReleasedSource(ctx, releaseName);

  if (current !== null && normalize(current) === normalize(options.source)) {
    reuse(ctx, options.label);
    return;
  }
  if (current !== null) {
    ctx.log.warn(
      `${options.label} on ${projectId} differ from the Root CMS rules. They apply to every site on this project, so replacing them can affect other apps.`
    );
    ctx.log.info(`Review the live rules at ${options.consoleUrl}`);
    const replace = await ctx.prompt.confirm(
      `Replace the live ${options.label} with the Root CMS rules?`,
      false
    );
    if (!replace) {
      ctx.state.todo.push(
        `Merge the Root CMS ${options.label} into your existing rules (${options.consoleUrl}).`
      );
      return;
    }
  }

  await mutate(ctx, `release ${options.label}`, async () => {
    const ruleset = await ctx.gcp.request({
      method: 'POST',
      url: `${RULES_API}/projects/${projectId}/rulesets`,
      body: {
        source: {files: [{name: options.fileName, content: options.source}]},
      },
      quotaProject: projectId,
    });
    const release = {name: releaseName, rulesetName: ruleset.name};
    if (current === null) {
      await ctx.gcp.request({
        method: 'POST',
        url: `${RULES_API}/projects/${projectId}/releases`,
        body: release,
        quotaProject: projectId,
      });
    } else {
      await ctx.gcp.request({
        method: 'PATCH',
        url: `${RULES_API}/${releaseName}`,
        body: {release},
        quotaProject: projectId,
      });
    }
  });
}

/** Returns the source of the released rules, or null if none are released. */
async function getReleasedSource(
  ctx: SetupContext,
  releaseName: string
): Promise<string | null> {
  const projectId = ctx.state.gcpProjectId!;
  let release;
  try {
    release = await ctx.gcp.request({
      url: `${RULES_API}/${releaseName}`,
      quotaProject: projectId,
    });
  } catch (err) {
    if (isGcpError(err, 'NOT_FOUND')) {
      return null;
    }
    throw err;
  }
  const ruleset = await ctx.gcp.request({
    url: `${RULES_API}/${release.rulesetName}`,
    quotaProject: projectId,
  });
  const files: Array<{content: string}> = ruleset?.source?.files || [];
  return files.map((f) => f.content).join('\n');
}

function normalize(source: string): string {
  return source.replace(/\s+/g, ' ').trim();
}
