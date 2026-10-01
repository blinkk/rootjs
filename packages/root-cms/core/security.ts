import {getApps, initializeApp} from 'firebase-admin/app';
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
          if isSignedIn() && userCanPublish();
        allow read:
          if isSignedIn() && userCanRead();
      }

      match /Collections/{collectionId}/Drafts/{document=**} {
        allow write:
          if isSignedIn() && userCanEdit();
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
        return (roles[email] in ['ADMIN', 'EDITOR', 'CONTRIBUTOR', 'VIEWER']) || (roles[domain] in ['ADMIN', 'EDITOR', 'CONTRIBUTOR', 'VIEWER']);
      }

      function userCanPublish() {
        let roles = getRoles();
        let email = request.auth.token.email;
        let domain = '*@' + email.split('@')[1];
        return (roles[email] in ['ADMIN', 'EDITOR']) || (roles[domain] in ['ADMIN', 'EDITOR']);
      }

      function userCanEdit() {
        let roles = getRoles();
        let email = request.auth.token.email;
        let domain = '*@' + email.split('@')[1];
        return (roles[email] in ['ADMIN', 'EDITOR', 'CONTRIBUTOR']) || (roles[domain] in ['ADMIN', 'EDITOR', 'CONTRIBUTOR']);
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
 * Firebase Storage rules for CMS uploads. Files are stored under
 * `{siteId}/uploads/...` and anyone who can edit drafts on that site can
 * upload. Reading the site's roles from Firestore requires the Firebase
 * Storage service agent to have `roles/firebaserules.firestoreServiceAgent`.
 */
export const STORAGE_RULES = `rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if false;
    }

    match /{site}/uploads/{allPaths=**} {
      allow read;
      allow write:
        if request.auth != null && userCanEdit(site);
    }

    function userCanEdit(site) {
      let roles = firestore.get(/databases/(default)/documents/Projects/$(site)).data.roles;
      let email = request.auth.token.email;
      let domain = '*@' + email.split('@')[1];
      return (roles[email] in ['ADMIN', 'EDITOR', 'CONTRIBUTOR']) || (roles[domain] in ['ADMIN', 'EDITOR', 'CONTRIBUTOR']);
    }
  }
}
`;

/**
 * Adds the root-cms security rules to a Firebase project.
 * NOTE: This function will overwrite any existing rules.
 */
export async function applySecurityRules(projectId: string) {
  const app =
    getApps().find((app) => app.options.projectId === projectId) ||
    initializeApp({projectId}, `root-cms-security-rules-${projectId}`);
  const securityRules = getSecurityRules(app);
  await securityRules.releaseFirestoreRulesetFromSource(FIRESTORE_RULES);
}
