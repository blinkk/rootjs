# Update Firestore security rules in CMS docs

- **id:** `2026-11-23-security-rules`
- **version:** 1
- **author:** scripts/propose_docs_copy.ts
- **generated:** 2026-11-24T00:28:03.777Z

## Summary

- Docs/cms: Updates the Firestore security rules snippet to v2 (wrapped in `// [START root-cms]` / `// [END root-cms]` markers with contributor/viewer rules) and documents how custom rules are preserved.

## Edit `Docs/cms`

Updates the Firestore security rules snippet to v2 and explains the `// [START root-cms]` / `// [END root-cms]` managed block.

### Set `content.sections.2.blocks.1.body`

```diff yaml
 blocks:
   - type: "paragraph"
     data:
-      text: "To apply them manually instead, paste the rules into the <b>Rules</b> tab under Firestore in the Firebase console:"
+      text: "The CMS manages the rules between <code>// [START root-cms]</code> and <code>// [END root-cms]</code>. Place any custom app rules outside those comments so they are preserved when you re-run <code>init-firebase</code> or update the rules from <b>Settings → Site Admin</b>."
+  - type: "paragraph"
+    data:
+      text: "To apply them manually instead, paste the rules into the <b>Rules</b> tab under Firestore in the Firebase console:"
 time: 1792454989530
 version: "2.28.2"
```

### Set `content.sections.2.blocks.2.code`

```diff text
 rules_version = '2';
 service cloud.firestore {
   match /databases/{database}/documents {
+    // [START root-cms]
+    // Managed by Root.js CMS. Do not edit between START and END comments;
+    // add custom rules outside this block so they are preserved on updates.
+    // root-cms-rules-version: 2
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

+      match /TranslationsManager/draft/Translations/{document=**} {
+        allow write:
+          if isSignedIn() && userCanEdit();
+      }
+
+      match /Tasks/{document=**} {
+        allow write:
+          if isSignedIn() && userCanEdit();
+      }
+
+      match /Counters/tasks {
+        allow write:
+          if isSignedIn() && userCanEdit();
+      }
+
+      match /Viewers/{viewerDoc} {
+        allow write:
+          if isSignedIn() && userCanRead();
+      }
+
+      match /UserProfiles/{email} {
+        allow write:
+          if isSignedIn() && userCanRead() && request.auth.token.email == email;
+      }
+
+      match /Users/{uid} {
+        allow write:
+          if isSignedIn() && userCanRead() && request.auth.uid == uid;
+      }
+
+      match /AiChats/{chatId} {
+        allow create:
+          if isSignedIn() && userCanRead() && request.resource.data.createdBy == request.auth.token.email;
+        allow update:
+          if isSignedIn() && userCanRead() && resource.data.createdBy == request.auth.token.email && request.resource.data.createdBy == request.auth.token.email;
+        allow delete:
+          if isSignedIn() && userCanRead() && resource.data.createdBy == request.auth.token.email;
+      }
+
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
+    // [END root-cms]
   }
 }
```
