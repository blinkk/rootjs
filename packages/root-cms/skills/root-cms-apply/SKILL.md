---
name: root-cms-apply
description: >-
  Review and apply a Root.js CMS (@blinkk/root-cms) change proposal — a YAML
  file describing proposed content edits — to the CMS database. Use this when
  asked to accept, apply, land, or merge proposed CMS changes, to preview what
  a proposal would do, or to check a proposal in CI. Triggers on requests
  mentioning "apply the proposal", "accept the CMS changes", "cms-proposals",
  or a `.yaml` file under a proposals directory.
---

# Applying Root.js CMS change proposals

A **change proposal** is a YAML file describing content edits that have not
been written to the database yet (see the `root-cms-propose` skill for how they
are authored). Applying one writes the changes to the CMS.

Proposals usually live in `cms-proposals/*.yaml` in the project repo.

## Prerequisites

- Run from the **root of a Root.js project** (a directory containing
  `root.config.ts`), except for `proposal.check`, which works anywhere.
- `proposal.diff` and `proposal.apply` need database access via Application
  Default Credentials — `gcloud auth application-default login` or
  `GOOGLE_APPLICATION_CREDENTIALS`.

## What applying does — and does not — do

Applying writes **drafts only**: doc draft fields, release contents, and draft
translations. It never publishes, schedules, unpublishes, or deletes anything.
Someone still has to publish from the CMS UI afterwards, so do not describe an
applied proposal as live.

Nothing is written unless **every** change in the proposal resolves cleanly. A
failure anywhere aborts the whole proposal, so a partial apply cannot happen.

## Step 1 — Check that the proposal is valid

```bash
npx root-cms proposal.check cms-proposals/2026-08-20-hero-refresh.yaml
```

Parses the file and checks it against the proposal format. Needs no database
access or Root project, so this is the right command for a CI gate on a pull
request. Collection schemas are checked later, by `proposal.diff`/`.apply`.
Exits non-zero on failure.

## Step 2 — See what it would write

```bash
npx root-cms proposal.diff cms-proposals/2026-08-20-hero-refresh.yaml
```

Resolves every change against the live database, validates the result against
the collection schemas, and reports what would be written, without writing.
Use this to review before applying. `proposal.apply --dry-run` is equivalent.

## Step 3 — Apply

```bash
npx root-cms proposal.apply cms-proposals/2026-08-20-hero-refresh.yaml
```

Useful flags:

| Flag | Effect |
| --- | --- |
| `--dry-run` | Resolve and validate, write nothing (same as `proposal.diff`). |
| `--verify-before` | Fail if a recorded `before` no longer matches the database. |
| `--skip-validation` | Skip collection schema validation. Use sparingly. |
| `--modified-by <email>` | Attribute the writes to a specific user. |

### About `--verify-before`

By default a proposal's `before` values are documentation for the human
reviewer and are **not** checked — the proposal's `after` values are written
regardless of what is currently in the database. Pass `--verify-before` when
the proposal may be stale and you would rather it fail than overwrite someone
else's newer edit.

## Step 4 — Read the result envelope

All three commands print a single-line JSON envelope to **stdout** and exit `0`
on success / `1` on failure:

```json
{"ok": true, "result": {"id": "...", "dryRun": false, "changes": [
  {"changeIndex": 0, "kind": "doc.edit", "target": "Pages/home",
   "summary": "3 field edits to the draft", "paths": ["hero.title"]}
]}}
```

```json
{"ok": false, "error": "2 change(s) could not be applied; nothing was written.",
 "errors": [{"changeIndex": 1, "kind": "doc.edit", "target": "Pages/about",
             "path": "hero.title", "message": "..."}]}
```

Always parse stdout as JSON and branch on `ok`. On failure, `errors` names the
offending change by index, so you can map it back to the YAML.

## Previewing a proposal on a running site

`RootCMSClient` can overlay an unapplied proposal on everything it **reads**,
so a developer can see proposed content rendered in context before accepting
it:

```ts
import {RootCMSClient} from '@blinkk/root-cms/client';
import {parseProposal} from '@blinkk/root-cms/core';

const res = parseProposal(fs.readFileSync('cms-proposals/x.yaml', 'utf8'));
if (res.ok) {
  const client = new RootCMSClient(rootConfig, {proposal: res.proposal});
  // getDoc/listDocs/batch reads now reflect the proposal.
}
```

The overlay affects reads only — writes never fold the proposal in, and
`getRawDoc()` / `listDocs({raw: true})` deliberately bypass it. Release changes
are not overlaid, since they affect publishing rather than rendering.

## Common failure modes

| Error | What it means |
| --- | --- |
| `Doc "X" does not exist` | A `doc.edit` targets a missing doc. It may need `doc.create`. |
| `Doc "X" already exists` | A `doc.create` targets an existing doc. It should be `doc.edit`. |
| `has already been published` | The release is published; releases cannot be edited afterwards. |
| `is scheduled` | Unschedule the release in the CMS UI first. |
| `Array index is out of range` | The array shrank since the proposal was written. |
| `no longer matches` | Only with `--verify-before`: the live value drifted. |

## Guidance for agents

- Run `proposal.check`, then `proposal.diff`, and read the diff before
  applying. Do not apply a proposal you have not looked at.
- Treat `proposal.apply` as side-effecting. Confirm intent with the user before
  running it unless they have already asked you to apply.
- Parse the stdout JSON envelope; never infer success from the exit code alone.
- If an apply fails, nothing was written — fix the proposal file and re-run
  rather than trying to apply the remaining changes piecemeal.
- After applying, tell the user the changes are in **drafts** and still need
  publishing from the CMS UI.
