import {execSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export interface GaeDeployOptions {
  /** GCP project id. */
  project?: string;
  /** Prefix to append to the version. */
  prefix?: string;
  /** Whether to divert traffic to the new version. */
  promote?: boolean;
  /** If provided, verifies that the given URL path returns a 200 response. */
  healthcheckUrl?: string;
  /** If provided, the latest N versions are preserved, all others are deleted */
  maxVersions?: number;
}

type AppYaml = any;

interface AppVersionInfo {
  service: string;
  id: string;
  traffic_split: number;
  last_deployed_time: {
    datetime: string;
  };
}

export async function gaeDeploy(appDir: string, options?: GaeDeployOptions) {
  if (!appDir) {
    throw new Error(
      '[gae-deplopy] Missing app dir, e.g. `root gae-deploy <app dir>`'
    );
  }

  const project = options?.project;
  if (!project) {
    throw new Error('[gae-deplopy] Missing: --project');
  }

  const appYamlPath = path.join(appDir, 'app.yaml');
  if (!fs.existsSync(appYamlPath)) {
    throw new Error(`[gae-deplopy] Missing: ${appYamlPath}`);
  }
  process.chdir(appDir);

  // Read the service from `app.yaml` and deploy it.
  const appYaml = yaml.load(fs.readFileSync('app.yaml', 'utf8')) as AppYaml;
  const service = appYaml.service;
  if (!service) {
    throw new Error(
      '[gae-deploy] Missing service definition. Ensure "service" is defined in app.yaml.'
    );
  }

  let prefix = options?.prefix;
  if (!prefix) {
    prefix = options?.promote ? 'prod' : 'staging';
  }
  const version = `${prefix}-${getTimestamp()}`;
  if (testVersionTooLong(version, service, project)) {
    throw new Error(`version "${version}" should not exceed 63 chars`);
  }

  console.log('[gae-deploy] 🚀 starting deployment...');

  // If the env_variables has placeholders like `MY_SECRET_TOKEN: {MY_SECRET_TOKEN}`,
  // replace with the current env value.
  const appYamlHasPlaceholders = testHasEnvPlaceholders(appYaml);
  let backupAppYaml = '';
  if (appYamlHasPlaceholders) {
    backupAppYaml = updateAppYamlEnv(appYamlPath, appYaml);
  }

  // Deploy the app.
  execSync(
    `gcloud app deploy -q --project=${project} --version=${version} --no-promote app.yaml`,
    {stdio: 'inherit'}
  );

  // Restore the original app.yaml, if needed.
  if (backupAppYaml) {
    fs.copyFileSync(backupAppYaml, 'app.yaml');
  }

  // Check the health of the new version and abort if unhealthy.
  if (options?.healthcheckUrl) {
    const healthcheckPassed = await testHealth(
      project,
      service,
      version,
      options.healthcheckUrl
    );
    if (!healthcheckPassed) {
      throw new Error(
        `[gae-deploy] ❌ health check failed. check logs: \n${getLogsURL(
          project,
          service,
          version
        )}`
      );
    }
    console.log('[gae-deploy] ✅ health check succeeded!');
  }

  if (options?.promote) {
    console.log(`[gae-deploy] promoting version ${version}...`);
    execSync(
      `gcloud app -q --project=${project} services set-traffic ${service} --splits ${version}=1`,
      {stdio: 'inherit'}
    );
  }

  if (options?.maxVersions) {
    // List all managed versions.
    const resp = execSync(
      `gcloud app versions list --project ${project} --service ${service} --format json`
    ).toString();
    const versions = JSON.parse(resp.toString()) as AppVersionInfo[];
    const managedVersions = versions
      .filter((appInfo: AppVersionInfo) =>
        testManagedVersion(service, appInfo, prefix)
      )
      .sort(
        (a, b) =>
          new Date(b.last_deployed_time.datetime).getTime() -
          new Date(a.last_deployed_time.datetime).getTime()
      );

    console.log(
      `[gae-deploy] 📦 all managed versions (${managedVersions.length}):`
    );
    for (const eachVersion of managedVersions) {
      console.log(`  ${eachVersion.id}`);
    }

    // Delete the oldest managed versions.
    for (const eachVersion of managedVersions.slice(options.maxVersions - 1)) {
      console.log(`[gae-deploy] ✂️ deleting old version ${eachVersion.id}`);
      execSync(
        `gcloud app versions delete -q --project=${project} --service=${service} ${eachVersion.id}`,
        {stdio: 'inherit'}
      );
    }
  }

  console.log(
    `[gae-deploy] ✨ deployment complete\nversions: ${getVersionsURL(
      project,
      service
    )}`
  );
}

/**
 * Returns whether a given version name is too long (a subdomain part should not
 * exceed 63 characters).
 */
function testVersionTooLong(version: string, service: string, project: string) {
  const subdomain = `${version}-dot-${service}-dot-${project}`;
  // console.log(subdomain, subdomain.length);
  return subdomain.length > 63;
}

/** Returns the logs viewer URL in the Google Cloud Console. */
function getLogsURL(project: string, service: string, version: string) {
  return `https://console.cloud.google.com/logs/query;query=resource.type%3D"gae_app"%0Aresource.labels.module_id%3D"${service}"%0Aresource.labels.version_id%3D"${version}"?project=${project}`;
}

/** Returns the App Engine versions viewer URL in the Google Cloud Console. */
function getVersionsURL(project: string, service: string) {
  return `https://console.cloud.google.com/appengine/versions?project=${project}&serviceId=${service}`;
}

/**
 * Returns whether the `env_variables` key in app.yaml has placeholders.
 *
 * Example:
 * ```yaml
 * env_variables:
 *   MY_SECRET_TOKEN: {MY_SECRET_TOKEN}
 * ```
 */
function testHasEnvPlaceholders(appYaml: AppYaml) {
  if (typeof appYaml?.env_variables !== 'object') {
    return false;
  }
  const envVars: Record<string, string> = appYaml.env_variables;
  return Object.values(envVars).some((envValue: string) => {
    return testIsEnvPlaceholder(envValue);
  });
}

function testIsEnvPlaceholder(envValue: string) {
  return envValue.startsWith('{') && envValue.endsWith('}');
}

/** Updates any placeholders used in environment variables with their values. */
function updateAppYamlEnv(appYamlPath: string, appYaml: AppYaml) {
  // Copy the original app.yaml to a backup file.
  const backupAppYaml = `${appYamlPath}.bak`;
  fs.copyFileSync(appYamlPath, backupAppYaml);
  let content = fs.readFileSync(appYamlPath, 'utf8');

  // Replace env_variables placeholders like `MY_SECRET_TOKEN: {MY_SECRET_TOKEN}`.
  const envVars: Record<string, string> = appYaml.env_variables;
  Object.entries(envVars).forEach(([envVar, envValue]) => {
    if (testIsEnvPlaceholder(envValue)) {
      const value = process.env[envVar];
      if (!value && content.includes(`{${envVar}}`)) {
        throw new Error(`[gae-deploy] Missing environment variable: ${envVar}`);
      } else if (value && content.includes(`{${envVar}}`)) {
        content = content.replaceAll(`{${envVar}}`, value);
      }
    }
  });

  fs.writeFileSync(appYamlPath, content, 'utf8');
  return backupAppYaml;
}

/**
 * Returns a timestamp for the version name, formatted `YYYYMMDDtHHMM`.
 */
function getTimestamp() {
  const pretty = (num: number) => (num + '').padStart(2, '0');
  const date = new Date();
  return `${date.getFullYear()}${pretty(date.getMonth() + 1)}${pretty(
    date.getDate()
  )}t${pretty(date.getHours())}${pretty(date.getMinutes())}`;
}

/**
 * Returns whether the App Engine service succeeds in handling a health check
 * request.
 */
export async function testHealth(
  project: string,
  service: string,
  version: string,
  healthcheckUrl: string
) {
  if (!healthcheckUrl.startsWith('/')) {
    healthcheckUrl = `/${healthcheckUrl}`;
  }
  const url = `https://${version}-dot-${service}-dot-${project}.appspot.com${healthcheckUrl}`;
  const response = await fetch(url);
  return response.status === 200;
}

/**
 * Returns whether a version is considered to be managed by this script, and
 * whether it's an "old" prod version (e.g. a version that receives no traffic).
 * This script only manages old prod versions.
 */
function testManagedVersion(
  service: string,
  appInfo: AppVersionInfo,
  prefix: string
) {
  const re = new RegExp(`${prefix}-\\d{8}t\\d{4}`);
  return (
    appInfo.service === service &&
    re.exec(appInfo.id) &&
    appInfo.traffic_split === 0.0
  );
}
