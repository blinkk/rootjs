import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {FIRESTORE_RULES, STORAGE_RULES} from '../../core/security.js';
import {SetupError} from './context.js';
import {GcpError} from './gcp.js';
import {runSetup, SetupOptions} from './setup.js';
import {FakeGcp, FakePrompter, memoryLogger} from './testing.js';

const PROJECT = 'acme-cms';
const NUMBER = '123456';
const USER = 'dev@example.com';
const FIREBASE = 'https://firebase.googleapis.com/v1beta1';
const RULES = 'https://firebaserules.googleapis.com/v1';
const STORAGE = 'https://firebasestorage.googleapis.com/v1alpha';
const IDP = `https://identitytoolkit.googleapis.com/v2/projects/${PROJECT}/defaultSupportedIdpConfigs/google.com`;
const SITE_DOC = (site: string) =>
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/Projects/${site}`;

const STARTER_CONFIG = `import {defineConfig} from '@blinkk/root';
import {cmsPlugin} from '@blinkk/root-cms/plugin';

export default defineConfig({
  server: {
    sessionCookieSecret: 'session-secret-change-me!',
  },
  plugins: [
    cmsPlugin({
      id: 'starter',
      name: 'Starter',
      firebaseConfig: {
        apiKey: 'YOUR_FIREBASE_API_KEY',
        authDomain: 'YOUR_FIREBASE_PROJECT_ID.firebaseapp.com',
        projectId: 'YOUR_FIREBASE_PROJECT_ID',
        storageBucket: 'YOUR_FIREBASE_PROJECT_ID.appspot.com',
      },
    }),
  ],
});
`;

const notFound = () => new GcpError('NOT_FOUND', 'not found');

/** A signed-in user and an existing, empty GCP project with billing on. */
function emptyProject(): FakeGcp {
  let firebaseAdded = false;
  let webAppCreated = false;
  let bucketCreated = false;
  let dbCreated = false;
  return new FakeGcp()
    .on('gcloud version', 'Google Cloud SDK 500.0.0')
    .on('gcloud auth list', `${USER}\n`)
    .on('gcloud auth application-default print-access-token', 'token')
    .on(
      'FETCH https://oauth2.googleapis.com/tokeninfo',
      JSON.stringify({email: USER})
    )
    .on('gcloud auth application-default set-quota-project', '')
    .on(
      'gcloud projects describe',
      JSON.stringify({projectId: PROJECT, projectNumber: NUMBER})
    )
    .on(
      'gcloud billing projects describe',
      JSON.stringify({billingEnabled: true})
    )
    .on('gcloud services list', 'serviceusage.googleapis.com\n')
    .on('gcloud services enable', '')
    .on(`GET ${FIREBASE}/projects/${PROJECT}/webApps/app-1/config`, {
      apiKey: 'AIza-test',
      authDomain: `${PROJECT}.firebaseapp.com`,
      projectId: PROJECT,
      storageBucket: '',
    })
    .on(`GET ${FIREBASE}/projects/${PROJECT}/webApps`, () =>
      webAppCreated ? {apps: [{appId: 'app-1', displayName: 'Root CMS'}]} : {}
    )
    .on(`POST ${FIREBASE}/projects/${PROJECT}/webApps`, () => {
      webAppCreated = true;
      return {name: 'operations/web', done: true, response: {appId: 'app-1'}};
    })
    .on(`GET ${FIREBASE}/projects/${PROJECT}`, () =>
      firebaseAdded ? {projectId: PROJECT} : notFound()
    )
    .on(`POST ${FIREBASE}/projects/${PROJECT}:addFirebase`, () => {
      firebaseAdded = true;
      return {name: 'operations/add', done: true};
    })
    .on(`GET ${IDP}`, {enabled: true})
    .on('gcloud firestore databases describe', () =>
      dbCreated ? '{"name":"(default)"}' : notFound()
    )
    .on('gcloud firestore databases create', () => {
      dbCreated = true;
      return '';
    })
    .on(`GET ${SITE_DOC('')}`, notFound)
    .on(`PATCH ${SITE_DOC('')}`, {})
    .on(`GET ${RULES}/projects/${PROJECT}/releases/`, notFound)
    .on(`POST ${RULES}/projects/${PROJECT}/rulesets`, {
      name: `projects/${PROJECT}/rulesets/r1`,
    })
    .on(`POST ${RULES}/projects/${PROJECT}/releases`, {})
    .on(`GET ${STORAGE}/projects/${PROJECT}/defaultBucket`, () =>
      bucketCreated
        ? {
            bucket: {
              name: `projects/${PROJECT}/buckets/${PROJECT}.firebasestorage.app`,
            },
          }
        : notFound()
    )
    .on(`POST ${STORAGE}/projects/${PROJECT}/defaultBucket`, () => {
      bucketCreated = true;
      return {
        bucket: {
          name: `projects/${PROJECT}/buckets/${PROJECT}.firebasestorage.app`,
        },
      };
    })
    .on('gcloud storage buckets describe', '{}')
    .on('gcloud storage buckets update', '')
    .on('gcloud storage buckets get-iam-policy', '{"bindings":[]}')
    .on('gcloud storage buckets add-iam-policy-binding', '')
    .on('gcloud projects get-iam-policy', '{"bindings":[]}')
    .on('gcloud projects add-iam-policy-binding', '')
    .on('gcloud iam roles describe', notFound)
    .on('gcloud iam roles create', '')
    .on('gcloud iam service-accounts describe', notFound)
    .on('gcloud iam service-accounts create', '')
    .on('EXEC', '');
}

/** Everything the wizard would create already exists. */
function finishedProject(site = 'www'): FakeGcp {
  const rulesFor: Record<string, string> = {
    'cloud.firestore': FIRESTORE_RULES,
    [`firebase.storage/${PROJECT}.firebasestorage.app`]: STORAGE_RULES,
  };
  const sa = `serviceAccount:root-${site}@${PROJECT}.iam.gserviceaccount.com`;
  return emptyProject()
    .on(
      'gcloud services list',
      [
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
      ].join('\n')
    )
    .on(`GET ${FIREBASE}/projects/${PROJECT}`, {projectId: PROJECT})
    .on(`GET ${FIREBASE}/projects/${PROJECT}/webApps`, {
      apps: [{appId: 'app-1'}],
    })
    .on(`GET ${FIREBASE}/projects/${PROJECT}/webApps/app-1/config`, {
      apiKey: 'AIza-test',
      authDomain: `${PROJECT}.firebaseapp.com`,
      projectId: PROJECT,
      storageBucket: `${PROJECT}.firebasestorage.app`,
    })
    .on('gcloud firestore databases describe', '{"name":"(default)"}')
    .on(`GET ${SITE_DOC(site)}`, {
      fields: {roles: {mapValue: {fields: {[USER]: {stringValue: 'ADMIN'}}}}},
    })
    .on(`GET ${RULES}/projects/${PROJECT}/releases/`, (call) => {
      const id = call.req!.url.split('/releases/')[1];
      return {
        rulesetName: `projects/${PROJECT}/rulesets/${encodeURIComponent(id)}`,
      };
    })
    .on(`GET ${RULES}/projects/${PROJECT}/rulesets/`, (call) => {
      const id = decodeURIComponent(call.req!.url.split('/rulesets/')[1]);
      return {source: {files: [{content: rulesFor[id]}]}};
    })
    .on(`GET ${STORAGE}/projects/${PROJECT}/defaultBucket`, {
      bucket: {
        name: `projects/${PROJECT}/buckets/${PROJECT}.firebasestorage.app`,
      },
    })
    .on(
      'gcloud storage buckets describe',
      JSON.stringify({cors_config: [{origin: ['*']}]})
    )
    .on(
      'gcloud storage buckets get-iam-policy',
      JSON.stringify({
        bindings: [{role: 'roles/storage.objectViewer', members: ['allUsers']}],
      })
    )
    .on(
      'gcloud projects get-iam-policy',
      JSON.stringify({
        bindings: [
          {
            role: 'roles/firebaserules.firestoreServiceAgent',
            members: [
              `serviceAccount:service-${NUMBER}@gcp-sa-firebasestorage.iam.gserviceaccount.com`,
            ],
          },
          {role: `projects/${PROJECT}/roles/rootCmsServer`, members: [sa]},
          {
            role: 'roles/secretmanager.secretAccessor',
            members: [sa],
            condition: {title: `root-${site}-secrets`},
          },
        ],
      })
    )
    .on('gcloud iam roles describe', () =>
      JSON.stringify({
        includedPermissions: [
          'datastore.databases.get',
          'datastore.databases.getMetadata',
          'datastore.entities.allocateIds',
          'datastore.entities.create',
          'datastore.entities.delete',
          'datastore.entities.get',
          'datastore.entities.list',
          'datastore.entities.update',
          'datastore.indexes.list',
          'firebaseauth.users.createSession',
          'firebaseauth.users.get',
          'storage.objects.create',
          'storage.objects.delete',
          'storage.objects.get',
          'storage.objects.list',
          'storage.objects.update',
        ],
      })
    )
    .on('gcloud iam service-accounts describe', '{}');
}

describe('root-cms setup', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'root-setup-'));
    await fs.promises.writeFile(
      path.join(rootDir, 'root.config.ts'),
      STARTER_CONFIG
    );
  });

  afterEach(async () => {
    await fs.promises.rm(rootDir, {recursive: true, force: true});
  });

  async function run(
    gcp: FakeGcp,
    prompt: FakePrompter,
    options: SetupOptions = {}
  ) {
    const log = memoryLogger();
    const state = await runSetup(options, {rootDir, gcp, prompt, log});
    return {state, log};
  }

  it('sets up an existing, empty project end to end', async () => {
    const gcp = emptyProject();
    gcp.adcQuotaProject = PROJECT;
    const prompt = new FakePrompter({
      'Existing project id': PROJECT,
      'Site id': 'www',
    });
    const {state} = await run(gcp, prompt);

    expect(gcp.mutations).toEqual([
      expect.stringMatching(
        /^gcloud services enable .*firestore\.googleapis\.com/
      ),
      `POST ${FIREBASE}/projects/${PROJECT}:addFirebase`,
      `POST ${FIREBASE}/projects/${PROJECT}/webApps`,
      expect.stringMatching(
        /^gcloud firestore databases create --database=\(default\) --location=us-central1/
      ),
      `POST ${RULES}/projects/${PROJECT}/rulesets`,
      `POST ${RULES}/projects/${PROJECT}/releases`,
      `PATCH ${SITE_DOC('www')}?updateMask.fieldPaths=roles`,
      `POST ${STORAGE}/projects/${PROJECT}/defaultBucket`,
      `POST ${RULES}/projects/${PROJECT}/rulesets`,
      `POST ${RULES}/projects/${PROJECT}/releases`,
      expect.stringContaining('roles/firebaserules.firestoreServiceAgent'),
      expect.stringMatching(
        /^gcloud storage buckets update gs:\/\/acme-cms\.firebasestorage\.app --cors-file=/
      ),
      expect.stringContaining(
        '--member=allUsers --role=roles/storage.objectViewer'
      ),
      expect.stringMatching(/^gcloud iam roles create rootCmsServer/),
      expect.stringMatching(/^gcloud iam service-accounts create root-www/),
      expect.stringContaining(
        `--role=projects/${PROJECT}/roles/rootCmsServer --condition=None`
      ),
      expect.stringContaining('--role=roles/secretmanager.secretAccessor'),
      `EXEC secrets init --gcp-project ${PROJECT} --gsm-key www-root-secrets`,
      'EXEC secrets set COOKIE_SECRET',
      'EXEC secrets sync',
    ]);

    // The admin role is written for the signed-in user.
    const patch = gcp.calls.find((c) => c.key.startsWith('PATCH'))!;
    expect(patch.req!.body).toEqual({
      fields: {roles: {mapValue: {fields: {[USER]: {stringValue: 'ADMIN'}}}}},
    });

    // Secrets are only readable by this site's account, by name prefix.
    const secretBinding = gcp.calls.find((c) =>
      c.key.includes('secretAccessor')
    )!;
    expect(secretBinding.args).toContain(
      `--condition=expression=resource.name.startsWith("projects/${NUMBER}/secrets/www-"),title=root-www-secrets`
    );

    // The generated secret goes over stdin, never argv.
    const setSecret = gcp.calls.find(
      (c) => c.key === 'EXEC secrets set COOKIE_SECRET'
    )!;
    expect(setSecret.input).toMatch(/^[\w-]{40,}$/);
    expect(setSecret.args!.join(' ')).not.toContain(setSecret.input!);

    const config = await fs.promises.readFile(
      path.join(rootDir, 'root.config.ts'),
      'utf8'
    );
    expect(config).toContain("id: 'www',");
    expect(config).toContain("apiKey: 'AIza-test',");
    expect(config).toContain(`projectId: '${PROJECT}',`);
    expect(config).toContain(
      `storageBucket: '${PROJECT}.firebasestorage.app',`
    );
    expect(config).toContain('sessionCookieSecret: process.env.COOKIE_SECRET,');
    expect(state.todo).toEqual([]);
  });

  it('changes nothing when the project is already set up', async () => {
    const gcp = finishedProject('www');
    gcp.adcQuotaProject = PROJECT;
    await fs.promises.writeFile(
      path.join(rootDir, '.root.secrets.json'),
      JSON.stringify({
        gcpProjectId: PROJECT,
        gsmKey: 'www-root-secrets',
        secrets: {COOKIE_SECRET: {}},
      })
    );
    const prompt = new FakePrompter({'Site id': 'www'});
    await run(gcp, prompt, {project: PROJECT});
    expect(gcp.mutations).toEqual(['EXEC secrets sync']);
  });

  it('makes no changes in dry-run mode, even for a new project', async () => {
    const gcp = emptyProject().on(
      'gcloud billing accounts list',
      JSON.stringify([{name: 'billingAccounts/AAA-BBB', displayName: 'Main'}])
    );
    const prompt = new FakePrompter({
      'Create a new GCP project': 'new',
      'New project id': PROJECT,
      'Site id': 'www',
    });
    const {state} = await run(gcp, prompt, {dryRun: true});
    expect(gcp.mutations).toEqual([]);
    expect(
      await fs.promises.readFile(path.join(rootDir, 'root.config.ts'), 'utf8')
    ).toBe(STARTER_CONFIG);
    expect(state.created).toEqual([]);
  });

  it('creates a new project and links billing', async () => {
    const gcp = emptyProject()
      .on('gcloud projects create', '')
      .on(
        'gcloud billing projects describe',
        JSON.stringify({billingEnabled: false})
      )
      .on(
        'gcloud billing accounts list',
        JSON.stringify([{name: 'billingAccounts/AAA-BBB', displayName: 'Main'}])
      )
      .on('gcloud billing projects link', '');
    const prompt = new FakePrompter({
      'Create a new GCP project': 'new',
      'New project id': PROJECT,
      'Site id': 'www',
    });
    await run(gcp, prompt);
    expect(gcp.mutations.slice(0, 2)).toEqual([
      `gcloud projects create ${PROJECT} --name ${PROJECT}`,
      `gcloud billing projects link ${PROJECT} --billing-account AAA-BBB`,
    ]);
  });

  it('asks before replacing rules shared with other sites', async () => {
    const gcp = finishedProject('www').on(
      `GET ${RULES}/projects/${PROJECT}/rulesets/`,
      {source: {files: [{content: 'service cloud.firestore { /* custom */ }'}]}}
    );
    gcp.adcQuotaProject = PROJECT;
    const prompt = new FakePrompter({'Site id': 'www'});
    const {state} = await run(gcp, prompt, {project: PROJECT});
    expect(prompt.asked).toContain(
      'Replace the live Firestore security rules with the Root CMS rules?'
    );
    // Declined by default: nothing is released.
    expect(gcp.mutations.filter((m) => m.includes('rulesets'))).toEqual([]);
    expect(state.todo.join('\n')).toContain('Firestore security rules');
  });

  it('asks for another site id when the id belongs to someone else', async () => {
    const gcp = finishedProject('blog')
      .on(`GET ${SITE_DOC('www')}`, {
        fields: {
          roles: {
            mapValue: {fields: {'other@example.com': {stringValue: 'ADMIN'}}},
          },
        },
      })
      .on(`GET ${SITE_DOC('blog')}`, notFound);
    gcp.adcQuotaProject = PROJECT;
    const prompt = new FakePrompter({
      'Site id': 'www',
      'Use this existing site anyway': false,
      'Pick a different site id': 'blog',
    });
    const {state} = await run(gcp, prompt, {project: PROJECT});
    expect(state.siteId).toBe('blog');
    expect(gcp.mutations).toContain(
      `PATCH ${SITE_DOC('blog')}?updateMask.fieldPaths=roles`
    );
    expect(gcp.mutations).not.toContain(
      `PATCH ${SITE_DOC('www')}?updateMask.fieldPaths=roles`
    );
  });

  it('keeps existing members when joining an existing site', async () => {
    const gcp = finishedProject('www').on(`GET ${SITE_DOC('www')}`, {
      fields: {
        roles: {
          mapValue: {fields: {'other@example.com': {stringValue: 'EDITOR'}}},
        },
      },
    });
    gcp.adcQuotaProject = PROJECT;
    const prompt = new FakePrompter({
      'Site id': 'www',
      'Use this existing site anyway': true,
    });
    await run(gcp, prompt, {project: PROJECT});
    const patch = gcp.calls.find((c) => c.key.startsWith('PATCH'))!;
    expect(patch.req!.body.fields.roles.mapValue.fields).toEqual({
      'other@example.com': {stringValue: 'EDITOR'},
      [USER]: {stringValue: 'ADMIN'},
    });
  });

  it('prints the Google sign-in steps and waits until it is enabled', async () => {
    let checks = 0;
    const gcp = finishedProject('www').on(`GET ${IDP}`, () =>
      ++checks > 1 ? {enabled: true} : notFound()
    );
    gcp.adcQuotaProject = PROJECT;
    const prompt = new FakePrompter({'Site id': 'www'});
    const {log, state} = await run(gcp, prompt, {project: PROJECT});
    expect(log.lines.join('\n')).toContain(
      `https://console.firebase.google.com/project/${PROJECT}/authentication/providers`
    );
    expect(prompt.asked).toContain("Press enter when that's done...");
    expect(state.todo).toEqual([]);
  });

  it('stops with a clear error when gcloud is missing', async () => {
    const gcp = new FakeGcp().on(
      'gcloud version',
      new GcpError('ENOENT', 'The Google Cloud CLI (gcloud) was not found.')
    );
    await expect(run(gcp, new FakePrompter())).rejects.toThrow(SetupError);
  });

  it('offers to run application-default login when ADC is missing', async () => {
    let loggedIn = false;
    const gcp = finishedProject('www')
      .on('gcloud auth application-default print-access-token', () =>
        loggedIn ? 'token' : new GcpError('UNKNOWN', 'no credentials')
      )
      .on('gcloud auth application-default login', () => {
        loggedIn = true;
      });
    gcp.adcQuotaProject = PROJECT;
    await run(gcp, new FakePrompter({'Site id': 'www'}), {project: PROJECT});
    expect(gcp.calls.map((c) => c.key)).toContain(
      'gcloud auth application-default login'
    );
  });

  it('sets the ADC quota project when it points elsewhere', async () => {
    const gcp = finishedProject('www');
    gcp.adcQuotaProject = 'some-other-project';
    await run(gcp, new FakePrompter({'Site id': 'www'}), {project: PROJECT});
    expect(gcp.mutations).toContain(
      `gcloud auth application-default set-quota-project ${PROJECT}`
    );
  });
});
