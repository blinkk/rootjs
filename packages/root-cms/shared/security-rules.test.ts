import {describe, expect, it} from 'vitest';
import {
  FIRESTORE_RULES,
  FIRESTORE_RULES_VERSION,
  ROOT_CMS_RULES_END,
  ROOT_CMS_RULES_START,
  getFirestoreConsoleRulesUrl,
  STORAGE_RULES,
  STORAGE_RULES_VERSION,
  getFirestoreRulesReleaseId,
  getStorageRules,
  hasRootCmsRulesMarkers,
  mergeFirestoreRules,
  mergeStorageRules,
  normalizeFirestoreDatabaseId,
  parseRulesVersion,
} from './security-rules.js';
import {
  LEGACY_FIRESTORE_RULES,
  LEGACY_STORAGE_RULES,
} from './testdata/legacy-security-rules.js';

describe('security-rules', () => {
  it('parses the embedded version from FIRESTORE_RULES', () => {
    expect(parseRulesVersion(FIRESTORE_RULES)).toBe(FIRESTORE_RULES_VERSION);
    expect(hasRootCmsRulesMarkers(FIRESTORE_RULES)).toBe(true);
    expect(parseRulesVersion('rules_version = "2";')).toBeNull();
  });

  it('creates full rules when none exist', () => {
    const res = mergeFirestoreRules(null);
    expect(res.status).toBe('created');
    expect(res.merged).toBe(FIRESTORE_RULES);
    expect(res.previousVersion).toBeNull();
    expect(res.preservedCustomRules).toBe(false);
  });

  it('preserves custom rules outside BEGIN/END markers when merging', () => {
    const customExisting = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Custom app rules above.
    match /AppUsers/{userId} {
      allow read, write: if request.auth.uid == userId;
    }

    // === BEGIN ROOT CMS MANAGED RULES (version: 1) — DO NOT EDIT ===
    match /{document=**} {
      allow read, write: if false;
    }
    match /Projects/{project} {
      allow read: if request.auth != null;
    }
    ${ROOT_CMS_RULES_END}

    // Custom app rules below.
    match /PublicConfig/{docId} {
      allow read: if true;
    }
  }
}
`;
    const res = mergeFirestoreRules(customExisting);
    expect(res.status).toBe('merged');
    expect(res.previousVersion).toBe(1);
    expect(res.preservedCustomRules).toBe(true);
    expect(res.merged).toContain('match /AppUsers/{userId}');
    expect(res.merged).toContain('match /PublicConfig/{docId}');
    expect(res.merged).toContain(ROOT_CMS_RULES_START);
    expect(res.merged).toContain('match /Viewers/{viewerDoc}');
    expect(parseRulesVersion(res.merged)).toBe(FIRESTORE_RULES_VERSION);
  });

  it('auto-upgrades unmodified legacy Root CMS rules without markers', () => {
    expect(LEGACY_FIRESTORE_RULES.length).toBe(3);
    for (const legacy of LEGACY_FIRESTORE_RULES) {
      // Comments and whitespace changes don't count as customizations.
      const reformatted = `// Deployed by hand.\n${legacy.replace(/\n/g, '\r\n')}`;
      for (const source of [legacy, reformatted]) {
        const res = mergeFirestoreRules(source);
        expect(res.status).toBe('upgraded');
        expect(res.previousVersion).toBeNull();
        expect(res.preservedCustomRules).toBe(false);
        expect(res.merged).toBe(FIRESTORE_RULES);
      }
    }
  });

  it('refuses to clobber legacy rules customized inside the Projects block', () => {
    const legacy = LEGACY_FIRESTORE_RULES[LEGACY_FIRESTORE_RULES.length - 1];
    const nestedRule = legacy.replace(
      '      function isSignedIn() {',
      '      match /PublicForms/{id} {\n        allow create: if true;\n      }\n      function isSignedIn() {'
    );
    const editedCondition = legacy.replace(
      "(roles[email] in ['ADMIN', 'EDITOR'])",
      "(roles[email] in ['ADMIN', 'EDITOR', 'PUBLISHER'])"
    );
    for (const source of [nestedRule, editedCondition]) {
      expect(source).not.toBe(legacy);
      const res = mergeFirestoreRules(source);
      expect(res.status).toBe('needs_manual_merge');
      expect(res.merged).toBeNull();
    }
  });

  it('refuses to clobber custom rules when markers are missing', () => {
    const customNoMarkers = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }

    match /Projects/{project} {
      allow read: if request.auth != null;
    }

    match /Orders/{orderId} {
      allow read: if request.auth != null;
    }
  }
}
`;
    const res = mergeFirestoreRules(customNoMarkers);
    expect(res.status).toBe('needs_manual_merge');
    expect(res.merged).toBeNull();
    expect(res.reason).toContain('BEGIN ROOT CMS MANAGED RULES');
    expect(res.reason).toContain(ROOT_CMS_RULES_END);
  });

  it('resolves release IDs and Firebase Console URLs for default and named databases', () => {
    expect(normalizeFirestoreDatabaseId()).toBe('(default)');
    expect(normalizeFirestoreDatabaseId('')).toBe('(default)');
    expect(normalizeFirestoreDatabaseId('(default)')).toBe('(default)');
    expect(normalizeFirestoreDatabaseId('staging-db')).toBe('staging-db');

    expect(getFirestoreRulesReleaseId()).toBe('cloud.firestore');
    expect(getFirestoreRulesReleaseId('(default)')).toBe('cloud.firestore');
    expect(getFirestoreRulesReleaseId('staging-db')).toBe(
      'cloud.firestore/staging-db'
    );

    expect(getFirestoreConsoleRulesUrl('my-proj')).toBe(
      'https://console.firebase.google.com/project/my-proj/firestore/databases/-default-/security/rules'
    );
    expect(getFirestoreConsoleRulesUrl('my-proj', '(default)')).toBe(
      'https://console.firebase.google.com/project/my-proj/firestore/databases/-default-/security/rules'
    );
    expect(getFirestoreConsoleRulesUrl('my-proj', 'staging-db')).toBe(
      'https://console.firebase.google.com/project/my-proj/firestore/databases/staging-db/security/rules'
    );
  });

  it('rejects duplicate BEGIN/END markers', () => {
    const duplicateMarkers = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    ${ROOT_CMS_RULES_START}
    ${ROOT_CMS_RULES_END}
    ${ROOT_CMS_RULES_START}
    ${ROOT_CMS_RULES_END}
  }
}
`;
    expect(hasRootCmsRulesMarkers(duplicateMarkers)).toBe(true);
    const dupRes = mergeFirestoreRules(duplicateMarkers);
    expect(dupRes.status).toBe('needs_manual_merge');
    expect(dupRes.merged).toBeNull();
  });

  it('reads site roles from the configured database in the storage rules', () => {
    const defaultPath = '/databases/(default)/documents/Projects/$(site)';
    expect(STORAGE_RULES).toContain(defaultPath);
    expect(getStorageRules('(default)')).toBe(STORAGE_RULES);
    expect(parseRulesVersion(STORAGE_RULES)).toBe(STORAGE_RULES_VERSION);

    const named = getStorageRules('staging-db');
    expect(named).toContain('/databases/staging-db/documents/Projects/$(site)');
    expect(named).not.toContain('(default)');
    expect(() => getStorageRules('x/documents/Open/$(site)) || true')).toThrow(
      'invalid Firestore database id'
    );
  });

  it('merges the storage rules like the firestore rules', () => {
    expect(mergeStorageRules(null, {databaseId: 'staging-db'}).merged).toBe(
      getStorageRules('staging-db')
    );

    // Unmodified legacy rules are upgraded, switching to the named database.
    const upgraded = mergeStorageRules(LEGACY_STORAGE_RULES[0], {
      databaseId: 'staging-db',
    });
    expect(upgraded.status).toBe('upgraded');
    expect(upgraded.merged).toBe(getStorageRules('staging-db'));

    // Custom rules outside the markers survive a database change.
    const custom = STORAGE_RULES.replace(
      ROOT_CMS_RULES_END,
      `${ROOT_CMS_RULES_END}\n    match /public/{file} {\n      allow read;\n    }`
    );
    const merged = mergeStorageRules(custom, {databaseId: 'staging-db'});
    expect(merged.status).toBe('merged');
    expect(merged.preservedCustomRules).toBe(true);
    expect(merged.merged).toContain('match /public/{file}');
    expect(merged.merged).toContain('/databases/staging-db/documents/');
    expect(merged.merged).not.toContain('(default)');

    const unmarked = LEGACY_STORAGE_RULES[0].replace(
      'allow read;',
      'allow read: if request.auth != null;'
    );
    expect(mergeStorageRules(unmarked).status).toBe('needs_manual_merge');
  });
});
