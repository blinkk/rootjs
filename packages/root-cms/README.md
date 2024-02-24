# Setting up Firestore

Firestore must be setup as `Native Mode` and not `Datastore Mode`

Firestore read/writes will need to be locked down by adding the following to the security rules (in Firebase's Firestore UI):
```
rules_version = '2';
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
```

In Firestore, add a document at `Projects/<yourprojectid>` with a value of `{roles: {"youremail@yourdomain.tld": "ADMIN"}}`.

Using Firestore Studio:
- Under `Give the collection an ID`, set `Collection ID` to `Projects`
- Under `Add its first document` set `Document ID` to your project ID
- For the first record set `Field name` to `roles` with a `Field type` of `map`
- In the map set the new `Field name` to your e-mail, `Field type` to `string` and `Field value` to `ADMIN` and save.