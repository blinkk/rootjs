# Setting up Firestore

Firestore must be setup as `Native Mode` and not `Datastore Mode`

Firestore read/writes will need to be locked down by adding the following to the security rules (in Firebase's Firestore UI):

```
rules_version = '2';
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
```

In Firestore, add a document at `Projects/<yourprojectid>` with a value of `{roles: {"youremail@yourdomain.tld": "ADMIN"}}`.

Using Firestore Studio:

- Under `Give the collection an ID`, set `Collection ID` to `Projects`
- Under `Add its first document` set `Document ID` to your project ID
- For the first record set `Field name` to `roles` with a `Field type` of `map`
- In the map set the new `Field name` to your e-mail, `Field type` to `string` and `Field value` to `ADMIN` and save.

## A note on `*@domain` role grants

The rules above support a wildcard `*@example.com` entry in `roles` that
matches every signed-in user whose verified email ends in `@example.com`.
This is convenient for granting access to a whole workspace, but be aware:

- Anyone Firebase Auth admits with an `@example.com` email — including
  newly-created accounts and any account that you no longer control —
  gains the role immediately, with no opt-in or audit trail.
- Never use a wildcard for a free-email provider (e.g. `*@gmail.com`):
  that grants access to anyone with a Google account.
- Prefer explicit per-email grants for `ADMIN` and `EDITOR`; reserve the
  wildcard for `CONTRIBUTOR` or `VIEWER` if you use it at all.
