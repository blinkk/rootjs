import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {STORAGE_RULES} from '../../core/security.js';
import {mutate, reuse, SetupContext} from './context.js';
import {gcloudJson, isGcpError} from './gcp.js';
import {addProjectBinding, hasBinding} from './iam.js';
import {applyRules} from './rules.js';

const STORAGE_API = 'https://firebasestorage.googleapis.com/v1alpha';
const GCI_SERVICE_ACCOUNT_URL = 'https://services.rootjs.dev/_/service_account';

/** CORS so the CMS and site can fetch uploaded files from the browser. */
const CORS = [
  {
    origin: ['*'],
    method: ['GET', 'HEAD'],
    responseHeader: ['Content-Type'],
    maxAgeSeconds: 3600,
  },
];

/**
 * Sets up the Firebase default storage bucket used for CMS uploads. The bucket
 * is shared by every site on the project; each site uploads under
 * `{siteId}/uploads/`.
 */
export async function setupStorage(ctx: SetupContext, options: {gci: boolean}) {
  ctx.log.step('Storage');
  const projectId = ctx.state.gcpProjectId!;
  let bucket = await getDefaultBucket(ctx);
  if (bucket) {
    reuse(ctx, `Storage bucket gs://${bucket}`);
  } else {
    const location = ctx.state.location || 'us-central1';
    const created = await mutate(
      ctx,
      `create the default storage bucket in ${location}`,
      () =>
        ctx.gcp.request({
          method: 'POST',
          url: `${STORAGE_API}/projects/${projectId}/defaultBucket`,
          body: {location, storageClass: 'STANDARD'},
          quotaProject: projectId,
        })
    );
    bucket = bucketIdFromName(created?.bucket?.name) || undefined;
  }
  if (!bucket) {
    return;
  }
  if (ctx.state.firebaseConfig) {
    ctx.state.firebaseConfig.storageBucket = bucket;
  }

  await applyRules(ctx, {
    label: 'Storage security rules',
    releaseId: `firebase.storage/${bucket}`,
    fileName: 'storage.rules',
    source: STORAGE_RULES,
    consoleUrl: `https://console.firebase.google.com/project/${projectId}/storage/${bucket}/rules`,
  });

  // The storage rules read site roles from Firestore, which needs this grant
  // on the Firebase Storage service agent.
  const storageAgent = `serviceAccount:service-${ctx.state.gcpProjectNumber || 'PROJECT_NUMBER'}@gcp-sa-firebasestorage.iam.gserviceaccount.com`;
  await addProjectBinding(
    ctx,
    storageAgent,
    'roles/firebaserules.firestoreServiceAgent'
  );

  const info =
    ctx.dryRun && !ctx.state.gcpProjectNumber
      ? null
      : await gcloudJson(ctx.gcp, [
          'storage',
          'buckets',
          'describe',
          `gs://${bucket}`,
        ]);
  if (info?.cors_config?.length) {
    reuse(ctx, 'Bucket CORS');
  } else {
    await mutate(ctx, `set CORS on gs://${bucket}`, async () => {
      const tmp = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'root-cms-')
      );
      const corsFile = path.join(tmp, 'cors.json');
      try {
        await fs.promises.writeFile(corsFile, JSON.stringify(CORS), 'utf8');
        await ctx.gcp.gcloud([
          'storage',
          'buckets',
          'update',
          `gs://${bucket}`,
          `--cors-file=${corsFile}`,
        ]);
      } finally {
        await fs.promises.rm(tmp, {recursive: true, force: true});
      }
    });
  }

  await setupPublicRead(ctx, bucket);
  if (options.gci) {
    await setupGci(ctx, bucket, info);
  }
}

/**
 * CMS file and image fields link to `https://storage.googleapis.com/...`, so
 * uploads need to be publicly readable.
 */
async function setupPublicRead(ctx: SetupContext, bucket: string) {
  const policy =
    ctx.dryRun && !ctx.state.gcpProjectNumber
      ? null
      : await gcloudJson(ctx.gcp, [
          'storage',
          'buckets',
          'get-iam-policy',
          `gs://${bucket}`,
        ]);
  if (hasBinding(policy, 'roles/storage.objectViewer', 'allUsers')) {
    reuse(ctx, 'Public read access for uploads');
    return;
  }
  ctx.log.info(
    'CMS image and file fields link straight to storage.googleapis.com, so uploaded files need to be publicly readable.'
  );
  const ok = await ctx.prompt.confirm(
    `Make files in gs://${bucket} publicly readable?`,
    true
  );
  if (!ok) {
    ctx.state.todo.push(
      `Uploaded files won't load on the site until gs://${bucket} is publicly readable (or you serve them another way).`
    );
    return;
  }
  try {
    await mutate(ctx, `make gs://${bucket} publicly readable`, () =>
      ctx.gcp.gcloud([
        'storage',
        'buckets',
        'add-iam-policy-binding',
        `gs://${bucket}`,
        '--member=allUsers',
        '--role=roles/storage.objectViewer',
      ])
    );
  } catch (err: any) {
    // Organizations often enforce public access prevention.
    ctx.log.warn(`Could not make the bucket public: ${err.message}`);
    ctx.state.todo.push(
      `Make gs://${bucket} publicly readable, or ask your org admin about the public access prevention policy.`
    );
  }
}

/**
 * The hosted image service (`gci: true`) needs a bucket with fine-grained
 * access control and owner access for its service account.
 */
async function setupGci(ctx: SetupContext, bucket: string, info: any) {
  let gciAccount = '';
  try {
    const text = await ctx.gcp.fetchText(GCI_SERVICE_ACCOUNT_URL);
    gciAccount =
      text.match(/[\w.+-]+@[\w.-]+\.gserviceaccount\.com/)?.[0] || '';
  } catch {
    // Handled below.
  }
  if (!gciAccount) {
    ctx.state.todo.push(
      `gci is on: share owner access on gs://${bucket} with the service account at ${GCI_SERVICE_ACCOUNT_URL}.`
    );
    return;
  }
  if (info?.uniform_bucket_level_access) {
    const ok = await ctx.prompt.confirm(
      `gci needs fine-grained access control on gs://${bucket}. Turn off uniform bucket-level access?`,
      true
    );
    if (!ok) {
      ctx.state.todo.push(
        `gci needs fine-grained access control on gs://${bucket}.`
      );
      return;
    }
    await mutate(
      ctx,
      `switch gs://${bucket} to fine-grained access control`,
      () =>
        ctx.gcp.gcloud([
          'storage',
          'buckets',
          'update',
          `gs://${bucket}`,
          '--no-uniform-bucket-level-access',
        ])
    );
  }
  await mutate(
    ctx,
    `give the gci service account owner access to gs://${bucket}`,
    () =>
      ctx.gcp.gcloud([
        'storage',
        'buckets',
        'add-iam-policy-binding',
        `gs://${bucket}`,
        `--member=serviceAccount:${gciAccount}`,
        '--role=roles/storage.legacyBucketOwner',
      ])
  );
}

async function getDefaultBucket(
  ctx: SetupContext
): Promise<string | undefined> {
  const projectId = ctx.state.gcpProjectId!;
  if (!ctx.state.gcpProjectNumber) {
    return undefined;
  }
  try {
    const res = await ctx.gcp.request({
      url: `${STORAGE_API}/projects/${projectId}/defaultBucket`,
      quotaProject: projectId,
    });
    return bucketIdFromName(res?.bucket?.name) || undefined;
  } catch (err) {
    if (isGcpError(err, 'NOT_FOUND')) {
      return undefined;
    }
    throw err;
  }
}

/** `projects/p/buckets/b` -> `b`. */
function bucketIdFromName(name?: string): string {
  return name?.split('/buckets/')[1] || '';
}
