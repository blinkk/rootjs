import {describe, expect, it} from 'vitest';
import {
  FIRESTORE_RULES,
  FIRESTORE_RULES_VERSION,
  ROOT_CMS_RULES_END,
  ROOT_CMS_RULES_START,
  getFirestoreConsoleRulesUrl,
  getFirestoreRulesReleaseId,
  hasRootCmsRulesMarkers,
  mergeFirestoreRules,
  normalizeFirestoreDatabaseId,
  parseRulesVersion,
} from './security-rules.js';

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

  it('preserves custom rules outside START/END markers when merging', () => {
    const customExisting = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Custom app rules above.
    match /AppUsers/{userId} {
      allow read, write: if request.auth.uid == userId;
    }

    ${ROOT_CMS_RULES_START}
    // root-cms-rules-version: 1
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
    expect(res.merged).toContain(
      `// root-cms-rules-version: ${FIRESTORE_RULES_VERSION}`
    );
    expect(res.merged).toContain('match /Viewers/{viewerDoc}');
    expect(parseRulesVersion(res.merged)).toBe(FIRESTORE_RULES_VERSION);
  });

  it('auto-upgrades unmodified legacy Root CMS rules without markers', () => {
    const legacy = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }

    match /Projects/{project} {
      allow write: if request.auth != null;
      allow read: if request.auth != null;
    }
  }
}
`;
    const res = mergeFirestoreRules(legacy);
    expect(res.status).toBe('upgraded');
    expect(res.previousVersion).toBeNull();
    expect(res.preservedCustomRules).toBe(false);
    expect(res.merged).toBe(FIRESTORE_RULES);
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
    expect(res.reason).toContain(ROOT_CMS_RULES_START);
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

  it('handles URLs in string literals and rejects duplicate START/END markers', () => {
    const legacyWithUrlString = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }

    match /Projects/{project} {
      allow read: if request.resource.data.url == 'https://example.com/path';
    }
  }
}
`;
    expect(mergeFirestoreRules(legacyWithUrlString).status).toBe('upgraded');

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
    const dupRes = mergeFirestoreRules(duplicateMarkers);
    expect(dupRes.status).toBe('needs_manual_merge');
    expect(dupRes.merged).toBeNull();
  });
});
