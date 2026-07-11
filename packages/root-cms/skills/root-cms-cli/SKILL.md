---
name: root-cms-cli
description: >-
  Interact with a Root.js CMS (@blinkk/root-cms) project from the command line.
  Use this when you need to read, write, publish, translate, or otherwise
  manipulate CMS content programmatically — fetching docs, saving drafts,
  publishing/unpublishing, listing collections, managing data sources,
  translations, releases, or user ACLs. Triggers on requests mentioning
  "root-cms", "Root.js CMS", CMS docs/collections/drafts, or the `root-cms` CLI.
---

# Root.js CMS CLI

`root-cms` is the CLI for [`@blinkk/root-cms`](https://www.npmjs.com/package/@blinkk/root-cms).
It exposes two commands designed for programmatic/AI use that let you call any
method on the `RootCMSClient` and discover what functionality is available:

- `root-cms client.methods` — list every callable method with its TypeScript
  signature and description (discovery).
- `root-cms client.call <method> [jsonArgs]` — invoke a method with
  JSON-encoded positional arguments and get a JSON result envelope.

Together these give you full programmatic access to the CMS backend
(Firestore) without needing to know the internals in advance.

## Prerequisites

- The command must be run **from the root of a Root.js project** (a directory
  containing `root.config.ts`). The CLI loads that config to connect to the
  correct Firebase project and Firestore database.
- Authentication uses Application Default Credentials (the same as other
  Firebase Admin tooling). If calls fail with auth errors, the environment
  needs `gcloud auth application-default login` or a
  `GOOGLE_APPLICATION_CREDENTIALS` service-account key.
- Invoke via the package binary. If `@blinkk/root-cms` is installed locally,
  use `npx root-cms ...` (or `pnpm exec root-cms ...`); otherwise the global
  `root-cms` binary.

## Step 1 — Discover available methods

Always start by discovering the API surface. Prefer the JSON form with
`--types` so you also get the exact shapes of the option/argument types:

```bash
npx root-cms client.methods --json --types
```

This prints:

```json
{
  "methods": [
    {
      "name": "getDoc",
      "signature": "getDoc<Fields = any>(collectionId: string, slug: string, options: GetDocOptions): Promise<Doc<Fields> | null>",
      "description": "Retrieves doc data from Root.js CMS."
    }
  ],
  "types": [
    {
      "name": "GetDocOptions",
      "declaration": "export interface GetDocOptions {\n    mode: DocMode;\n}",
      "description": ""
    }
  ]
}
```

For a quick human-readable overview instead, run `npx root-cms client.methods`
(optionally with `--types`).

Use the `signature` of each method to construct the correct positional
arguments, and the `types` block to fill in option objects (e.g. what fields
`GetDocOptions` expects).

## Step 2 — Call a method

The argument to `client.call` after the method name is a **JSON array of the
method's positional arguments**, in order. It is not human-friendly by design —
it maps 1:1 to the TypeScript signature.

```bash
# getDoc(collectionId, slug, options)
npx root-cms client.call getDoc '["Pages", "home", {"mode": "draft"}]'

# listDocs(collectionId, options)
npx root-cms client.call listDocs '["Pages", {"mode": "published", "limit": 10}]'

# saveDraftData(docId, fieldsData, options?)
npx root-cms client.call saveDraftData '["Pages/home", {"title": "Hello"}]'

# A method that takes no arguments — omit the JSON array entirely:
npx root-cms client.call publishScheduledDocs
```

### Passing large or complex args via stdin

Pass `-` as the args value to read the JSON array from stdin. Useful for large
payloads:

```bash
echo '["Pages/home", {"title": "Hello"}]' | npx root-cms client.call saveDraftData -
cat args.json | npx root-cms client.call setRawDoc -
```

## Step 3 — Read the result envelope

`client.call` always prints a single-line JSON envelope to **stdout** and
exits `0` on success / `1` on failure:

```json
{"ok": true, "result": <the method's return value, or null for void methods>}
{"ok": false, "error": "<error message>"}
```

Always parse stdout as JSON and branch on `ok`. On `ok: false`, read `error`
for the reason (unknown method, invalid args, auth failure, not-found, etc.).

## Firestore value encoding

Special Firestore types are encoded as plain JSON objects in **both** the
arguments you send and the results you receive, so they round-trip cleanly:

| Firestore type      | JSON encoding                              |
| ------------------- | ------------------------------------------ |
| `Timestamp`         | `{"_seconds": 1700000000, "_nanoseconds": 0}` |
| `GeoPoint`          | `{"_latitude": 37.77, "_longitude": -122.41}` |
| `DocumentReference` | `{"_referencePath": "Projects/foo/..."}`   |

When constructing args that need a timestamp or reference, use these shapes and
they will be converted to real Firestore objects before the method is called.

## Common recipes

```bash
# Fetch a published doc's fields
npx root-cms client.call getDoc '["Pages", "home", {"mode": "published"}]'

# Update a single nested field in a draft (partial update)
npx root-cms client.call updateDraftData '["Pages/home", "hero.title", "New title"]'

# Publish specific docs
npx root-cms client.call publishDocs '[["Pages/home", "Pages/about"]]'

# Count docs in a collection
npx root-cms client.call getDocsCount '["Pages", {"mode": "draft"}]'

# Look up a user's role
npx root-cms client.call getUserRole '["someone@example.com"]'
```

Note: for a method like `publishDocs(docIds: string[], options?)`, the first
positional argument is itself an array, so the JSON args array is
`[["Pages/home", "Pages/about"]]` — an array containing the `docIds` array.

## Guidance for agents

- Run `client.methods --json --types` first; do not guess method names or
  argument order — read them from the signatures.
- The JSON args array is **positional and ordered** — match the signature
  exactly. Optional trailing arguments (`options?`) may be omitted.
- Treat writes (`saveDraftData`, `setRawDoc`, `publishDocs`, `unpublishDocs`,
  `archiveDataSource`, etc.) as side-effecting. Confirm intent before running
  them, and prefer `mode: "draft"` when reading to avoid touching published
  content unintentionally.
- Parse the stdout JSON envelope; never assume success from exit code alone.
- These commands print only the JSON envelope/help to stdout (the decorative
  CLI banner is suppressed), so stdout is safe to pipe into `jq` or a parser.
