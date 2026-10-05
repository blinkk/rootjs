import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Returns the identity (usually an email) that writes made from the CLI are
 * attributed to, or `undefined` if none can be determined.
 *
 * Checks, in order:
 * - The `ROOT_CMS_USER` env var.
 * - The `CLOUDSDK_CORE_ACCOUNT` env var (gcloud's account override).
 * - The `account` of the active gcloud configuration, i.e. the value of
 *   `gcloud config get-value account`.
 *
 * The gcloud config is read from disk rather than by shelling out to `gcloud`,
 * which keeps the lookup fast for commands that are called in a loop.
 */
export function getCliUser(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const fromEnv =
    env.ROOT_CMS_USER?.trim() || env.CLOUDSDK_CORE_ACCOUNT?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return readGcloudAccount(env);
}

/**
 * Reads the `core.account` value from the active gcloud configuration.
 */
function readGcloudAccount(env: NodeJS.ProcessEnv): string | undefined {
  try {
    const configDir = getGcloudConfigDir(env);
    let configName = env.CLOUDSDK_ACTIVE_CONFIG_NAME?.trim();
    if (!configName) {
      const activeConfigPath = path.join(configDir, 'active_config');
      configName = fs.existsSync(activeConfigPath)
        ? fs.readFileSync(activeConfigPath, 'utf8').trim()
        : '';
    }
    const configPath = path.join(
      configDir,
      'configurations',
      `config_${configName || 'default'}`
    );
    if (!fs.existsSync(configPath)) {
      return undefined;
    }
    return parseGcloudAccount(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Returns gcloud's config dir, which can be overridden by `CLOUDSDK_CONFIG`.
 */
function getGcloudConfigDir(env: NodeJS.ProcessEnv): string {
  if (env.CLOUDSDK_CONFIG) {
    return env.CLOUDSDK_CONFIG;
  }
  if (process.platform === 'win32' && env.APPDATA) {
    return path.join(env.APPDATA, 'gcloud');
  }
  return path.join(os.homedir(), '.config', 'gcloud');
}

/**
 * Parses the `account` value from the `[core]` section of a gcloud
 * configuration file (INI format).
 */
export function parseGcloudAccount(ini: string): string | undefined {
  let section = '';
  for (const rawLine of ini.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) {
      continue;
    }
    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    if (section !== 'core') {
      continue;
    }
    const valueMatch = line.match(/^account\s*[=:]\s*(.*)$/);
    if (valueMatch) {
      return valueMatch[1].trim() || undefined;
    }
  }
  return undefined;
}
