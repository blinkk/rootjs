---
name: rootjs-docs
description: >-
  Add or edit pages on the rootjs.dev developer docs (`/docs/`), which live in
  the docs site's CMS rather than in Markdown files. Use this whenever a change
  needs documenting, or when asked to write, update, fix or reorganize docs,
  guides, or the API/CLI reference in this repo.
---

# Editing the rootjs.dev docs

The docs site (`docs/`, the `@private/docs` project) renders its pages from its
own Root.js CMS. There are no Markdown files to edit: the copy is written in
TypeScript, turned into a CMS change proposal, reviewed in the PR, and applied
to the CMS after merge.

| What | Where |
| --- | --- |
| Developer docs (`/docs/*`) | `docs/scripts/docs_copy_content.ts` → `Docs` collection |
| API and CLI reference | `docs/reference/*.json`, generated from the built packages |
| Non-technical guides (`/guides/*`) | `docs/scripts/guides_content.ts` → `Guides` collection (see `docs/guides/README.md`) |
| Screenshots | `docs/screenshots/` (see `docs/screenshots/README.md`) |
| Doc schema | `docs/collections/Docs.schema.ts` |
| Page template | `docs/routes/docs/[[...slug]].tsx` |

Run every command below from `docs/`.

## 1. Write the copy

Each page is a `DocCopy` constant in `docs/scripts/docs_copy_content.ts`, listed
in `DOCS_COPY` in sidebar order (the sidebar groups pages by `meta.category`, so
the order only matters within a category). Read a neighboring page first and
match it.

- **Slug**: nested pages use `--` for `/`, e.g. `cms--checks` is
  `/docs/cms/checks`.
- **Fields**: `meta` (`title` ends in ` – Root.js`, `description`, `category`,
  `navLabel`) and `content` (`title`, an intro `body`, and `sections`).
- **Sections**: `section(id, title, bodyBlocks, extraBlocks)`. The `id` is the
  URL anchor, so don't rename existing ones. Body blocks are `p()`, `ul()`,
  `ol()` and `html()`; extra blocks are `code(lang, src)`, `plain(src)` and
  `copy(...blocks)` for prose that follows a code block.
- **Inline HTML**: use `c('x')` for `<code>` and `a(href, text)` for links.
  Escape `<` and `>` inside `c()` as `&lt;` and `&gt;`. Link other pages by
  path and anchor, e.g. `a('/docs/cms/#cron-jobs', 'scheduled job')`.
- **Code samples**: start with a `// @/path/to/file.ts` comment when the file
  matters, and use `// ...` for elided options. Escape backticks and `${` in
  template literals.
- **`note`**: a one-line summary shown to the reviewer in the proposal.

Copy guidelines (also in the file header and `docs/ROOT.md`): call the product
"Root.js" and the CMS "the CMS" (never "Root CMS"), use pnpm, and write prose
like a colleague, not a help-desk article. Prefer a sentence over a bullet
list, be specific, skip preambles and summaries, and don't document options in
full; link to the API reference instead.

Check every API, option name, and default you mention against the source.

## 2. Generate the proposal

```sh
node scripts/propose_docs_copy.ts --only <slug>[,<slug>] --id <yyyy-mm-dd>-<topic>
pnpm exec root-cms proposal.check cms-proposals/<id>.md
```

The proposal script diffs `docs_copy_content.ts` against the current drafts in
Firestore and writes `docs/cms-proposals/<id>.md` (a `doc.create` for new pages,
a `doc.edit` per changed field otherwise). Always pass `--only` with the pages
you changed, or the proposal sweeps in every difference between the file and
the CMS, including edits people made in the CMS since the last run. If the
proposal contains changes you didn't make, someone edited that page in the CMS;
copy their edits back into `docs_copy_content.ts` and regenerate rather than
reverting them.

The `collection schema not exported` warning from the proposal script is
expected under plain `node`; `proposal.check` validates against the schema.

Both commands need application-default credentials
(`gcloud auth application-default login`). If they're missing, commit the
`docs_copy_content.ts` change and say the proposal still needs to be generated.

## 3. Regenerate the reference (API or CLI changes)

The API and CLI reference pages are read from `docs/reference/*.json` when the
site renders, not from the CMS. After changing public exports, doc comments, or
CLI commands, rebuild and regenerate:

```sh
pnpm -C .. build
pnpm reference
```

Commit the updated JSON files with the change. Don't describe options in full
in the prose docs; the reference already lists them.

## 4. Ship it

Commit `docs_copy_content.ts`, the proposal, and any reference JSON in the same
PR as the code change. Mention in the PR description that the proposal needs to
be applied after merge:

```sh
pnpm exec root-cms proposal.apply cms-proposals/<id>.md
```

Applying writes drafts only. The page goes live when it's published in the CMS.
New pages also need a sidebar position:
`node scripts/propose_docs_copy.ts --assign-order` writes it to the drafts.
Don't run `proposal.apply` or `--assign-order` without being asked, because
they write to the production CMS.

## Changesets

Docs-only changes don't need a changeset.
