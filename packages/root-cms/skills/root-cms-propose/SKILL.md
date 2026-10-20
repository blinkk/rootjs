---
name: root-cms-propose
description: >-
  Propose content changes to a Root.js CMS (@blinkk/root-cms) project as a
  reviewable Markdown file instead of writing to the database. Use this whenever
  you are asked to edit, rewrite, translate, or restructure CMS content and a
  human should review the change first — in a pull request, before anything is
  saved. Covers doc field edits, new docs, duplicated docs, releases, and
  translations. Triggers on requests to "propose", "draft", "suggest", or "PR"
  CMS content changes, or to change content without writing to the db.
---

# Proposing Root.js CMS changes

A **change proposal** is a single Markdown file describing content edits you want
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
diff. Fetch the current content first — never guess at before values:

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

Write to `cms-proposals/<id>.md` in the project repo. Use a descriptive,
date-prefixed id, e.g. `cms-proposals/2026-08-20-hero-refresh.md`.

The format is Markdown, laid out so the pull request reads like a diff: each
change is a `##` heading, each op is a `###` heading, and each value is a code
block. A changed value is a single `diff` block, so the reviewer sees the
removed and added lines in red and green.

````md
# Refresh the homepage hero for the Q3 launch

- **id:** `2026-08-20-hero-refresh`
- **version:** 1
- **project:** `my-project`
- **author:** claude-code

## Summary

Marketing asked for a benefit-led headline and a new callout module.

## Edit `Pages/home`

Headline rewrite plus a new callout module.

### Set `hero.title`

```diff text
-Welcome to Acme
+Build faster with Acme
```

### Set `hero.body`

```diff text
-Acme is a platform for building websites.
+Acme is the fastest way to ship a website.

-Get started in minutes.
+Your first page is live in under five minutes.
```

### Set `hero.cta`

```diff yaml
 label: "Get started"
-url: "/signup"
+url: "/start"
```

### Insert into `content.modules` at 2

```yaml
_type: "CalloutModule"
title: "Ships in minutes"
```

### Remove from `content.modules` at 5

```yaml
_type: "LegacyBanner"
```
````

### Layout

- `# Title`, then a metadata list: `id` and `version` (always `1`) are
  required; `project`, `author`, and `generated` (ISO-8601) are optional.
- `## Summary` (optional): free Markdown for the reviewer.
- One `##` heading per change. Prose directly under it (before the first `###`
  or code block) is the change's note.
- Ids and paths go in backticks, exactly as shown.

### Change kinds

| Heading | Body |
| --- | --- |
| `` ## Edit `Pages/home` `` | `###` ops |
| `` ## Create `Pages/new` `` | one `yaml` block: the complete fields object |
| `` ## Duplicate `Pages/home` to `Pages/home-v2` `` | none |
| `` ## Create release `q3-launch` `` | `###` ops over `description` / `docIds` / `dataSourceIds` |
| `` ## Update release `q3-launch` `` | same as create release |
| `` ## Translations `Pages/home` `` | `### Source` entries (below) |

````md
## Create `Pages/pricing`

```yaml
meta:
  title: "Pricing"
hero:
  title: "Simple pricing"
```

## Duplicate `Pages/home` to `Pages/home-v2`

## Create release `q3-launch`

### Set `description`

```text
Q3 marketing launch
```

### Set `docIds`

```yaml
- "Pages/home"
- "Pages/pricing"
```

## Translations `Pages/home`

### Source

```text
Welcome to Acme
```

#### `es`

```diff text
-Bienvenido a Acme
+Crea más rápido con Acme
```

#### `fr`

```diff text
+Créez plus vite avec Acme
```
````

### Operations

- `` ### Set `path` `` — write the value at `path`.
- `` ### Insert into `path` at 2 `` — insert the value into the array at
  `path`, before position 2. Drop `at <index>` to append.
- `` ### Remove from `path` at 5 `` — delete item 5 from the array at `path`.
  The block (the removed item, for the reviewer) is optional.

Operations apply **in order**, and array indices refer to the array state
*after* earlier operations in the same proposal have been applied.

### Value blocks

The info string after the opening backticks says how the block is read:

- `text` — the block is the string, verbatim (every line, including blank
  ones). Use it for any string value: titles, prose, code.
- `yaml` or `json` — anything else: objects, lists, numbers, booleans.
- `diff text`, `diff yaml` — the whole value before *and* after. Every line
  starts with `" "` (in both), `-` (before only), or `+` (after only); a
  blank line counts as unchanged. Include every line of the value, not just
  the changed ones, since both values are rebuilt from the block. In a
  `diff text` block with no `-` or `" "` lines, the before value is `null`
  (the field was empty).

Use a `diff` block whenever you know the current value, and a plain block for
inserts and new fields. If the value itself contains a code fence, open the
block with more backticks than any run inside it (e.g. four for a value that
contains three).

## Rules that matter

**Show the real before value.** The diff documents what the value was when you
wrote the proposal. The applier ignores it by default, so it never blocks an
apply — but a wrong before value misleads the human reading the diff. Fetch the
real value; do not invent one.

**Quote strings in `yaml` blocks.** YAML converts bare scalars by type, so an
unquoted `true`, `null`, `1.10`, or `0o17` becomes a boolean, null, or number
rather than the text you meant, and fails collection-schema validation later.
For a value that is just a string, use a `text` block instead.

**Use plain JSON shapes for values.** Arrays are plain lists — never the
`_array` object notation. Rich text uses the `{version, time, blocks}` shape
with `blocks` as a plain list of `{type, data}` objects.

**Prefer narrow paths.** Set `content.sections.2.title`, not the whole
`content.sections`, when only one field changes: the diff stays short.

**One proposal per logical change.** A reviewer should be able to accept or
reject the whole file. Several changes may target the same doc; they compose in
order.

**Create requires a complete fields object** and fails if the doc already
exists. Use `## Edit` for existing docs.

**Notes can't contain code blocks.** A code block under a change heading is
read as a value.

## Step 3 — Validate before you finish

Always check that the file parses and matches the proposal format:

```bash
npx root-cms proposal.check cms-proposals/2026-08-20-hero-refresh.md
```

This needs no database access or Root project, so it also works as a CI gate.
It prints a JSON envelope and exits non-zero on failure:

```json
{"ok": true, "result": {"id": "...", "changes": [{"index": 0, "kind": "doc.edit", "target": "Pages/home"}]}}
{"ok": false, "error": "invalid proposal:\n  file.md:12 (changes.0.ops.1.after): ..."}
```

Errors carry a file line number. Fix them and re-run until it passes.

Then, from a Root project with database access, confirm the changes resolve
and pass collection-schema validation:

```bash
npx root-cms proposal.diff cms-proposals/2026-08-20-hero-refresh.md
```

## Guidance for agents

- Read current values with `client.call getDoc` before writing any diff.
- Never call `saveDraftData`, `setRawDoc`, `updateDraftData`, `publishDocs`, or
  any other write method in this workflow. Writing the file is the deliverable.
- Use `text` blocks for strings and `diff` blocks for changed values, and
  quote every string inside a `yaml` block.
- Run `proposal.check` before you report the work as done, and fix what it
  reports rather than explaining it away.
- Commit the proposal file and open a pull request so a human can review the
  diff. Mention in the PR body that applying it requires
  `root-cms proposal.apply`.
- Applying a proposal only ever writes drafts. Publishing stays manual, so do
  not describe a proposal as "going live".
