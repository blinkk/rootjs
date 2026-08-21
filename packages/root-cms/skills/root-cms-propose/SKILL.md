---
name: root-cms-propose
description: >-
  Propose content changes to a Root.js CMS (@blinkk/root-cms) project as a
  reviewable YAML file instead of writing to the database. Use this whenever
  you are asked to edit, rewrite, translate, or restructure CMS content and a
  human should review the change first — in a pull request, before anything is
  saved. Covers doc field edits, new docs, duplicated docs, releases, and
  translations. Triggers on requests to "propose", "draft", "suggest", or "PR"
  CMS content changes, or to change content without writing to the db.
---

# Proposing Root.js CMS changes

A **change proposal** is a single YAML file describing content edits you want
to make. It is committed to the project repo and reviewed in a pull request.
Nothing touches the database until someone runs `root-cms proposal.apply`.

Your job in this skill is to **write the file**. Do not call any write method.

## When to propose vs. write directly

Propose when a human should review before the change lands: bulk edits, copy
rewrites, anything touching published-adjacent content, anything you are not
certain about. Write directly (via the `root-cms-cli` skill) only when the user
has explicitly asked you to save changes now.

## Step 1 — Read the current values

A proposal records both the old and the new value so the reviewer can see the
diff. Fetch the current content first — never guess at `before` values:

```bash
npx root-cms client.call getDoc '["Pages", "home", {"mode": "draft"}]'
```

To see what fields a collection allows, and their types:

```bash
npx root-cms client.call getCollection '["Pages"]'
```

Field paths in a proposal are **dotted, relative to the doc's fields object,
with zero-based array indices** — `hero.title`, `content.modules.2.title`. Do
not prefix them with `fields.`.

## Step 2 — Write the proposal file

Write to `cms-proposals/<id>.yaml` in the project repo. Use a descriptive,
date-prefixed id, e.g. `cms-proposals/2026-08-20-hero-refresh.yaml`.

```yaml
version: 1
id: 2026-08-20-hero-refresh
title: Refresh the homepage hero for the Q3 launch
project: my-project
author: claude-code
summary: |
  Marketing asked for a benefit-led headline and a new callout module.

changes:
  - kind: doc.edit
    docId: Pages/home
    note: Headline rewrite plus a new callout module.
    ops:
      - op: set
        path: hero.title
        before: "Welcome to Acme"
        after: "Build faster with Acme"

      # Multi-line prose: use a block scalar so it diffs line-by-line.
      - op: set
        path: hero.body
        before: |-
          Acme is a platform for building websites.

          Get started in minutes.
        after: |-
          Acme is the fastest way to ship a website.

          Your first page is live in under five minutes.

      - op: insert_item
        path: content.modules
        index: 2
        after:
          _type: CalloutModule
          title: "Ships in minutes"

      - op: remove_item
        path: content.modules
        index: 5
        before:
          _type: LegacyBanner
```

### Change kinds

| `kind` | Target keys | Body |
| --- | --- | --- |
| `doc.edit` | `docId` | `ops` |
| `doc.create` | `docId` | `after` (the complete fields object) |
| `doc.duplicate` | `fromDocId`, `toDocId` | none |
| `release.create` | `releaseId` | `ops` over `description` / `docIds` / `dataSourceIds` |
| `release.update` | `releaseId` | same as `release.create` |
| `translations` | `translationsId` | `entries` |

```yaml
  - kind: doc.create
    docId: Pages/pricing
    after:
      meta:
        title: "Pricing"
      hero:
        title: "Simple pricing"

  - kind: doc.duplicate
    fromDocId: Pages/home
    toDocId: Pages/home-v2

  - kind: release.create
    releaseId: q3-launch
    ops:
      - op: set
        path: description
        after: "Q3 marketing launch"
      - op: set
        path: docIds
        after:
          - Pages/home
          - Pages/pricing

  - kind: translations
    translationsId: Pages/home
    entries:
      - source: "Welcome to Acme"
        locales:
          es:
            before: "Bienvenido a Acme"
            after: "Crea más rápido con Acme"
          fr:
            before: null
            after: "Créez plus vite avec Acme"
```

### Operations

- `set` — write `after` at `path`. Required: `after`.
- `insert_item` — insert `after` into the array at `path`. `index` is the
  position to insert before; omit it to append.
- `remove_item` — delete the item at `index` from the array at `path`.
  `index` is required.

Operations apply **in order**, and array indices refer to the array state
*after* earlier operations in the same proposal have been applied.

## Rules that matter

**Always quote string values, or use a block scalar.** YAML converts bare
scalars by type, so an unquoted `true`, `null`, `1.10`, or `0o17` becomes a
boolean, null, or number rather than the text you meant. For keys the format
requires to be strings (`source`, `path`, `docId`, …) the parser rejects it
outright; for `after` values it surfaces later as a collection-schema
validation failure. When in doubt, quote.

**`before` is for the reviewer.** It documents what the value was when you
wrote the proposal. The applier ignores it by default, so it never blocks an
apply — but a wrong `before` misleads the human reading the diff. Fetch the
real value; do not invent one.

**Use plain JSON shapes for values.** Arrays are plain YAML lists — never the
`_array` object notation. Rich text uses the `{version, time, blocks}` shape
with `blocks` as a plain list of `{type, data}` objects.

**One proposal per logical change.** A reviewer should be able to accept or
reject the whole file. Several changes may target the same doc; they compose in
order.

**`doc.create` requires a complete fields object** and fails if the doc already
exists. Use `doc.edit` for existing docs.

## Step 3 — Validate before you finish

Always check that the file parses and matches the proposal format:

```bash
npx root-cms proposal.check cms-proposals/2026-08-20-hero-refresh.yaml
```

This needs no database access or Root project, so it also works as a CI gate.
It prints a JSON envelope and exits non-zero on failure:

```json
{"ok": true, "result": {"id": "...", "changes": [{"index": 0, "kind": "doc.edit", "target": "Pages/home"}]}}
{"ok": false, "error": "invalid proposal:\n  file.yaml:12 (changes.0.ops.1.after): ..."}
```

Errors carry a file line number. Fix them and re-run until it passes.

Then, from a Root project with database access, confirm the changes resolve
and pass collection-schema validation:

```bash
npx root-cms proposal.diff cms-proposals/2026-08-20-hero-refresh.yaml
```

## Guidance for agents

- Read current values with `client.call getDoc` before writing any `before`.
- Never call `saveDraftData`, `setRawDoc`, `updateDraftData`, `publishDocs`, or
  any other write method in this workflow. Writing the file is the deliverable.
- Quote every string value. Reach for `|-` for anything multi-line.
- Run `proposal.check` before you report the work as done, and fix what it
  reports rather than explaining it away.
- Commit the proposal file and open a pull request so a human can review the
  diff. Mention in the PR body that applying it requires
  `root-cms proposal.apply`.
- Applying a proposal only ever writes drafts. Publishing stays manual, so do
  not describe a proposal as "going live".
