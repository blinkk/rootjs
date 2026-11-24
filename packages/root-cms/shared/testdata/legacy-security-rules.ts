/**
 * Firestore rulesets shipped by Root.js CMS before the BEGIN/END markers
 * existed, oldest first. Used to test that unmodified legacy rules are
 * upgraded automatically.
 */
export const LEGACY_FIRESTORE_RULES = [
  `rules_version = '2';
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
`,
  `rules_version = '2';
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
`,
  `rules_version = '2';
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
`,
];

/** Storage rulesets shipped by Root.js CMS before the BEGIN/END markers. */
export const LEGACY_STORAGE_RULES = [
  `rules_version = '2';
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
`,
];
