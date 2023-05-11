import {initializeApp} from 'firebase-admin/app';
import {getSecurityRules} from 'firebase-admin/security-rules';

export const FIRESTORE_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /Projects/{project}/{document=**} {
      allow write:
        if request.auth != null
        && exists(/databases/$(database)/documents/Projects/$(project))
        && get(/databases/$(database)/documents/Projects/$(project)).data.roles[request.auth.token.email] in ['ADMIN', 'EDITOR'];
      allow read:
        if request.auth != null
        && exists(/databases/$(database)/documents/Projects/$(project))
        && get(/databases/$(database)/documents/Projects/$(project)).data.roles[request.auth.token.email] in ['ADMIN', 'EDITOR', 'VIEWER'];
    }

    match /Projects/{project}/Collections/{collection}/{document=**} {
      allow write:
        if request.auth != null
        && exists(/databases/$(database)/documents/Projects/$(project)/Collections/$(collection))
        && get(/databases/$(database)/documents/Projects/$(project)/Collections/$(collection)).data.roles[request.auth.token.email] in ['ADMIN', 'EDITOR'];
      allow read:
        if request.auth != null
        && exists(/databases/$(database)/documents/Projects/$(project)/Collections/$(collection))
        && get(/databases/$(database)/documents/Projects/$(project)/Collections/$(collection)).data.roles[request.auth.token.email] in ['ADMIN', 'EDITOR', 'VIEWER'];
    }
  }
}
`;

/**
 * Adds the root-cms security rules to a Firebase project.
 * NOTE: This function will overwrite any existing rules.
 */
export async function applySecurityRules(projectId: string) {
  // TODO(stevenle): check if an app exists first before initializing.
  const app = initializeApp({projectId});
  const securityRules = getSecurityRules(app);
  await securityRules.releaseFirestoreRulesetFromSource(FIRESTORE_RULES);
}
