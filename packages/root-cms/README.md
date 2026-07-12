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

# CLI for AI agents (`root-cms client.*`)

The `root-cms` CLI exposes two commands that let an AI coding agent (or any
script) drive the `RootCMSClient` programmatically. Run them from the root of a
Root.js project (a directory containing `root.config.ts`).

Discover the available API:

```bash
# Human-readable list of methods + descriptions
root-cms client.methods

# Machine-readable JSON, including referenced type/interface definitions
root-cms client.methods --json --types
```

Call any method with a JSON array of positional arguments:

```bash
# getDoc(collectionId, slug, options)
root-cms client.call getDoc '["Pages", "home", {"mode": "draft"}]'

# A no-arg method (omit the JSON array)
root-cms client.call publishScheduledDocs

# Read large args from stdin by passing `-`
echo '["Pages/home", {"title": "Hello"}]' | root-cms client.call saveDraftData -
```

`client.call` prints a single-line JSON envelope to stdout and exits non-zero
on failure:

```json
{"ok": true, "result": <value>}
{"ok": false, "error": "<message>"}
```

Firestore `Timestamp`, `GeoPoint`, and `DocumentReference` values are encoded
as `{"_seconds","_nanoseconds"}`, `{"_latitude","_longitude"}`, and
`{"_referencePath"}` respectively in both arguments and results.

## Downloadable agent skill

A ready-to-use skill that teaches AI coding agents how to use these commands
ships with the package. Install it with:

```bash
root-cms skill.install
```

Root stays agnostic of any particular AI provider: the command auto-detects
existing agent skills directories (e.g. `.claude/skills`, `.agent/skills`, or
any `.*/skills` directory already in your project) and installs into them. If
none is found, it installs to `.agent/skills`. Pass an explicit directory to
override detection (e.g. `root-cms skill.install ./my-agent/skills`), or
`--force` to overwrite an existing copy.

# Embedding the CMS (`@blinkk/root-cms/browser-client`)

`@blinkk/root-cms/browser-client` is a dependency-free, framework-agnostic
browser library for embedding Root CMS into another site. It wraps the
underlying iframe/postMessage wiring behind a typed API, so the wire protocol
can evolve without breaking your integration.

For pop-up/iframe embedding (the doc editor and Root AI), the embedding page's
origin must be allowlisted in the CMS plugin config:

```ts
// root.config.ts
cmsPlugin({
  // ...
  allowedIframeOrigins: ['https://app.example.com'],
});
```

## Headless doc editor (pop-up or iframe)

Opens `/cms/embed/content/<collection>/<slug>`, a minimal version of the doc
editor with explicit (non-auto) saving. In `popup` mode, call from a user
gesture (e.g. a click handler) to avoid pop-up blockers. Closing the editor
discards unsaved changes.

```ts
import {RootCMSBrowserClient} from '@blinkk/root-cms/browser-client';

const root = new RootCMSBrowserClient({cmsOrigin: 'https://cms.example.com'});

const editor = root.openEditor('Pages/about', {
  mode: 'popup', // or 'iframe' (pass `container`)
  deeplink: 'hero.title', // optional: field to scroll to on load
});
editor.on('ready', () => console.log('editor loaded'));
editor.on('saved', () => location.reload());
editor.on('published', () => editor.closeAndReload());
editor.on('close', () => console.log('editor closed'));
editor.focusField('hero.image'); // scroll the editor to a field
editor.reload();
editor.close(); // or editor.closeAndReload()
```

## Headless Root AI (pop-up or iframe)

Opens `/cms/embed/ai`, the compact Root AI chat, optionally with a doc as
context:

```ts
const ai = root.openRootAI({docId: 'Pages/about', mode: 'popup'});
ai.on('ready', () => console.log('chat loaded'));
ai.close();
```

## Field focus from the in-CMS preview pane ("click to edit")

When your site is rendered inside the CMS preview pane, use a
`PreviewConnection` to focus editor fields from the page and to highlight page
nodes when the editor requests it. The preview pane is same-origin with the
CMS, so no config is needed and the connection is inert when the page is not
embedded:

```ts
import {RootCMSBrowserClient} from '@blinkk/root-cms/browser-client';

const preview = RootCMSBrowserClient.connectPreview();
if (preview.isEmbedded) {
  // "Click to edit": focus the field in the doc editor.
  el.addEventListener('click', () => preview.focusField('hero.title'));
  // Highlight page nodes when the editor hovers/focuses a field.
  preview.on('highlight', ({deepKey, scroll}) => {
    clearHighlights();
    if (deepKey) highlightNode(deepKey, {scroll});
  });
}
```
