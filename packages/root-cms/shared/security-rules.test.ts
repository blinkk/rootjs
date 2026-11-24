import {describe, expect, it} from 'vitest';
import {
  FIRESTORE_RULES,
  FIRESTORE_RULES_VERSION,
  ROOT_CMS_RULES_END,
  ROOT_CMS_RULES_START,
  hasRootCmsRulesMarkers,
  mergeFirestoreRules,
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
});
