import {initializeApp} from 'firebase-admin/app';
import {getSecurityRules} from 'firebase-admin/security-rules';

export const FIRESTORE_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }

    match /Projects/{project} {
      allow write:
        if isSignedIn() && userIsAdmin();
      allow read:
        if isSignedIn() && userCanRead();

      match /{collection}/{document=**} {
        allow write:
          if isSignedIn() && userCanWrite();
        allow read:
          if isSignedIn() && userCanRead();
      }

      function isSignedIn() {
        return request.auth != null;
      }

      function getRoles() {
        return get(/databases/$(database)/documents/Projects/$(project)).data.roles;
      }

      function userCanRead() {
        let roles = getRoles();
        let email = request.auth.token.email;
        let domain = '*@' + email.split('@')[1];
        return (roles[email] in ['ADMIN', 'EDITOR', 'VIEWER']) || (roles[domain] in ['ADMIN', 'EDITOR', 'VIEWER']);
      }

      function userCanWrite() {
        let roles = getRoles();
        let email = request.auth.token.email;
        let domain = '*@' + email.split('@')[1];
        return (roles[email] in ['ADMIN', 'EDITOR']) || (roles[domain] in ['ADMIN', 'EDITOR']);
      }

      function userIsAdmin() {
        let roles = getRoles();
        let email = request.auth.token.email;
        let domain = '*@' + email.split('@')[1];
        return (roles[email] == 'ADMIN') || (roles[domain] == 'ADMIN');
      }
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
