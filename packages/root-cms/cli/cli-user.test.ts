import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {getCliUser, parseGcloudAccount} from './cli-user.js';

describe('parseGcloudAccount', () => {
  it('reads the account from the core section', () => {
    const ini = [
      '[compute]',
      'account = wrong@example.com',
      '',
      '[core]',
      'project = my-project',
      'account = user@example.com',
    ].join('\n');
    expect(parseGcloudAccount(ini)).toBe('user@example.com');
  });

  it('returns undefined when no account is set', () => {
    expect(parseGcloudAccount('[core]\nproject = my-project\n')).toBe(
      undefined
    );
    expect(parseGcloudAccount('')).toBe(undefined);
  });
});

describe('getCliUser', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcloud-config-'));
    fs.mkdirSync(path.join(configDir, 'configurations'));
  });

  afterEach(() => {
    fs.rmSync(configDir, {recursive: true, force: true});
  });

  it('prefers the ROOT_CMS_USER env var', () => {
    expect(
      getCliUser({
        ROOT_CMS_USER: 'env@example.com',
        CLOUDSDK_CORE_ACCOUNT: 'gcloud@example.com',
        CLOUDSDK_CONFIG: configDir,
      })
    ).toBe('env@example.com');
  });

  it('falls back to the CLOUDSDK_CORE_ACCOUNT env var', () => {
    expect(
      getCliUser({
        CLOUDSDK_CORE_ACCOUNT: 'gcloud@example.com',
        CLOUDSDK_CONFIG: configDir,
      })
    ).toBe('gcloud@example.com');
  });

  it('reads the account from the active gcloud config', () => {
    fs.writeFileSync(path.join(configDir, 'active_config'), 'work\n');
    fs.writeFileSync(
      path.join(configDir, 'configurations', 'config_work'),
      '[core]\naccount = work@example.com\n'
    );
    expect(getCliUser({CLOUDSDK_CONFIG: configDir})).toBe('work@example.com');
  });

  it('defaults to the "default" gcloud config', () => {
    fs.writeFileSync(
      path.join(configDir, 'configurations', 'config_default'),
      '[core]\naccount = default@example.com\n'
    );
    expect(getCliUser({CLOUDSDK_CONFIG: configDir})).toBe(
      'default@example.com'
    );
  });

  it('returns undefined when no identity is found', () => {
    expect(getCliUser({CLOUDSDK_CONFIG: configDir})).toBe(undefined);
  });
});
