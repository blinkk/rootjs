import {describe, expect, it} from 'vitest';
import {updateRootConfig} from './config.js';
import {serviceAccountId} from './iam.js';
import {validateSiteId} from './project.js';
import {gsmKeyForSite} from './secrets.js';

const VALUES = {
  siteId: 'www',
  firebaseConfig: {
    apiKey: 'AIza-test',
    authDomain: 'acme.firebaseapp.com',
    projectId: 'acme',
    storageBucket: 'acme.firebasestorage.app',
  },
};

describe('updateRootConfig', () => {
  it('fills the starter placeholders', () => {
    const source = `cmsPlugin({
      id: 'starter',
      firebaseConfig: {
        apiKey: 'YOUR_FIREBASE_API_KEY',
        authDomain: "YOUR_FIREBASE_PROJECT_ID.firebaseapp.com",
        projectId: 'YOUR_FIREBASE_PROJECT_ID',
        storageBucket: 'YOUR_FIREBASE_PROJECT_ID.appspot.com',
      },
    })`;
    const result = updateRootConfig(source, VALUES);
    expect(result.missing).toEqual([]);
    expect(result.source).toBe(`cmsPlugin({
      id: 'www',
      firebaseConfig: {
        apiKey: 'AIza-test',
        authDomain: "acme.firebaseapp.com",
        projectId: 'acme',
        storageBucket: 'acme.firebasestorage.app',
      },
    })`);
  });

  it('points a hardcoded sessionCookieSecret at the env var', () => {
    const source = `server: {sessionCookieSecret: 'change-me'},
cmsPlugin({id: 'a', firebaseConfig: {apiKey: '', authDomain: '', projectId: '', storageBucket: ''}})`;
    const result = updateRootConfig(source, VALUES);
    expect(result.source).toContain(
      'sessionCookieSecret: process.env.COOKIE_SECRET}'
    );
  });

  it('leaves values read from env vars alone and reports them', () => {
    const source = `cmsPlugin({
      id: 'a',
      firebaseConfig: {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: 'x',
        projectId: 'x',
        storageBucket: 'x',
      },
    })`;
    const result = updateRootConfig(source, VALUES);
    expect(result.missing).toEqual(['apiKey']);
    expect(result.source).toContain('apiKey: process.env.FIREBASE_API_KEY');
  });

  it('reports everything missing when there is no cmsPlugin()', () => {
    const result = updateRootConfig('export default {}', VALUES);
    expect(result.missing).toHaveLength(5);
    expect(result.source).toBe('export default {}');
  });
});

describe('site ids', () => {
  it('accepts lowercase ids with hyphens', () => {
    expect(validateSiteId('www')).toBeUndefined();
    expect(validateSiteId('marketing-site-2')).toBeUndefined();
  });

  it('rejects ids that would break Firestore or Secret Manager names', () => {
    expect(validateSiteId('My Site')).toBeDefined();
    expect(validateSiteId('-www')).toBeDefined();
    expect(validateSiteId('a/b')).toBeDefined();
  });

  it('prefixes the Secret Manager key with the site id', () => {
    expect(gsmKeyForSite('blog')).toBe('blog-root-secrets');
  });

  it('keeps service account ids within 6-30 characters', () => {
    expect(serviceAccountId('www')).toBe('root-www');
    expect(serviceAccountId('a')).toBe('root-a');
    expect(serviceAccountId('abcdefghijklmnopqrstuvwx-yz')).toBe(
      'root-abcdefghijklmnopqrstuvwx'
    );
    expect(serviceAccountId('a-very-long-site-id-for-marketing')).toHaveLength(
      30
    );
  });
});
