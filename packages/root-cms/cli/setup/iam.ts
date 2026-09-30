import {mutate, reuse, SetupContext} from './context.js';
import {gcloudJson, isGcpError} from './gcp.js';

/** Project-level custom role shared by every Root CMS site on the project. */
export const SERVER_ROLE_ID = 'rootCmsServer';

/** Permissions the CMS server needs at runtime. */
export const SERVER_ROLE_PERMISSIONS = [
  // Firestore reads and writes.
  'datastore.databases.get',
  'datastore.databases.getMetadata',
  'datastore.entities.allocateIds',
  'datastore.entities.create',
  'datastore.entities.delete',
  'datastore.entities.get',
  'datastore.entities.list',
  'datastore.entities.update',
  'datastore.indexes.list',
  // Firebase Auth token checks and session cookies.
  'firebaseauth.users.createSession',
  'firebaseauth.users.get',
  // Uploads and file reads.
  'storage.objects.create',
  'storage.objects.delete',
  'storage.objects.get',
  'storage.objects.list',
  'storage.objects.update',
];

/** Service account ids are 6-30 characters. */
export function serviceAccountId(siteId: string): string {
  const id = `root-${siteId}`.slice(0, 30).replace(/-+$/, '');
  return id.length >= 6 ? id : `${id}-cms`;
}

/**
 * Creates the shared `rootCmsServer` custom role and a runtime service
 * account for this site. The account can read only this site's secrets
 * (`{siteId}-*`); Firestore and storage access are project-wide because IAM
 * can't scope them to a path.
 */
export async function setupIam(ctx: SetupContext) {
  ctx.log.step('Permissions');
  const projectId = ctx.state.gcpProjectId!;
  const siteId = ctx.state.siteId!;
  await ensureServerRole(ctx);

  const accountId = serviceAccountId(siteId);
  const email = `${accountId}@${projectId}.iam.gserviceaccount.com`;
  ctx.state.serviceAccount = email;
  let exists = false;
  if (ctx.state.gcpProjectNumber) {
    try {
      await gcloudJson(ctx.gcp, [
        'iam',
        'service-accounts',
        'describe',
        email,
        '--project',
        projectId,
      ]);
      exists = true;
    } catch (err) {
      if (!isGcpError(err, 'NOT_FOUND')) {
        throw err;
      }
    }
  }
  if (exists) {
    reuse(ctx, `Service account ${email}`);
  } else {
    await mutate(ctx, `create service account ${email}`, () =>
      ctx.gcp.gcloud([
        'iam',
        'service-accounts',
        'create',
        accountId,
        '--project',
        projectId,
        `--display-name=Root CMS (${siteId})`,
      ])
    );
  }

  const member = `serviceAccount:${email}`;
  await addProjectBinding(
    ctx,
    member,
    `projects/${projectId}/roles/${SERVER_ROLE_ID}`
  );
  const projectNumber = ctx.state.gcpProjectNumber || 'PROJECT_NUMBER';
  await addProjectBinding(ctx, member, 'roles/secretmanager.secretAccessor', {
    title: `root-${siteId}-secrets`,
    expression: `resource.name.startsWith("projects/${projectNumber}/secrets/${siteId}-")`,
  });
}

async function ensureServerRole(ctx: SetupContext) {
  const projectId = ctx.state.gcpProjectId!;
  let role: any = null;
  if (ctx.state.gcpProjectNumber) {
    try {
      role = await gcloudJson(ctx.gcp, [
        'iam',
        'roles',
        'describe',
        SERVER_ROLE_ID,
        '--project',
        projectId,
      ]);
    } catch (err) {
      if (!isGcpError(err, 'NOT_FOUND')) {
        throw err;
      }
    }
  }
  if (!role) {
    await mutate(ctx, `create custom role ${SERVER_ROLE_ID}`, () =>
      ctx.gcp.gcloud([
        'iam',
        'roles',
        'create',
        SERVER_ROLE_ID,
        '--project',
        projectId,
        '--title=Root CMS server',
        '--description=Runtime access for Root CMS sites (managed by root-cms setup).',
        `--permissions=${SERVER_ROLE_PERMISSIONS.join(',')}`,
        '--stage=GA',
      ])
    );
    return;
  }
  if (role.deleted) {
    ctx.log.warn(
      `The custom role ${SERVER_ROLE_ID} was deleted. Undelete it with \`gcloud iam roles undelete ${SERVER_ROLE_ID} --project ${projectId}\` and run this again.`
    );
    ctx.state.todo.push(`Undelete the ${SERVER_ROLE_ID} custom role.`);
    return;
  }
  const current = new Set<string>(role.includedPermissions || []);
  const missing = SERVER_ROLE_PERMISSIONS.filter((p) => !current.has(p));
  if (missing.length === 0) {
    reuse(ctx, `Custom role ${SERVER_ROLE_ID}`);
    return;
  }
  // The role is shared with other sites, so never change it silently.
  ctx.log.warn(
    `The shared custom role ${SERVER_ROLE_ID} is missing: ${missing.join(', ')}`
  );
  const ok = await ctx.prompt.confirm(
    `Add these permissions to ${SERVER_ROLE_ID}?`,
    true
  );
  if (!ok) {
    ctx.state.todo.push(
      `Add ${missing.join(', ')} to the ${SERVER_ROLE_ID} role.`
    );
    return;
  }
  await mutate(
    ctx,
    `add ${missing.length} permission(s) to ${SERVER_ROLE_ID}`,
    () =>
      ctx.gcp.gcloud([
        'iam',
        'roles',
        'update',
        SERVER_ROLE_ID,
        '--project',
        projectId,
        `--add-permissions=${missing.join(',')}`,
      ])
  );
}

/** Adds a project-level IAM binding unless it's already there. */
export async function addProjectBinding(
  ctx: SetupContext,
  member: string,
  role: string,
  condition?: {title: string; expression: string}
) {
  const projectId = ctx.state.gcpProjectId!;
  const policy = ctx.state.gcpProjectNumber
    ? await gcloudJson(ctx.gcp, ['projects', 'get-iam-policy', projectId])
    : null;
  if (hasBinding(policy, role, member, condition?.title)) {
    reuse(ctx, `${role} for ${member}`);
    return;
  }
  const conditionArg = condition
    ? `--condition=expression=${condition.expression},title=${condition.title}`
    : '--condition=None';
  await mutate(ctx, `grant ${role} to ${member}`, () =>
    ctx.gcp.gcloud([
      'projects',
      'add-iam-policy-binding',
      projectId,
      `--member=${member}`,
      `--role=${role}`,
      conditionArg,
    ])
  );
}

/** Returns true if an IAM policy already grants `role` to `member`. */
export function hasBinding(
  policy: any,
  role: string,
  member: string,
  conditionTitle?: string
): boolean {
  const bindings: any[] = policy?.bindings || [];
  return bindings.some(
    (b) =>
      b.role === role &&
      (b.members || []).includes(member) &&
      (b.condition?.title || undefined) === conditionTitle
  );
}
