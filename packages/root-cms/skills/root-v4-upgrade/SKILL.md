---
name: root-v4-upgrade
description: >-
  Upgrade a Root.js project (@blinkk/root, @blinkk/root-cms) from v3 to v4:
  snapshot the site before changing anything, update the packages, move
  secrets to the Root.js secrets manager, batch CMS data fetching, optionally
  move CMS routes to createRoute() (only if the user wants it), then compare
  the site before and after and offer to file GitHub issues for anything left.
  Use this when asked to "upgrade to Root.js v4", "migrate to Root v4", or to
  follow https://rootjs.dev/skills/root-v4-upgrade.md.
---

# Upgrading a Root.js project to v4

The goal is a project on Root.js v4 that renders the same pages as before,
and a short report of what changed, what was tested and what's left. The
parts:

1. **Required**: update the packages.
2. **Recommended**: move secrets to `root secrets`, and load CMS data with
   batch requests. Suggest these and apply the ones the user agrees to.
3. **Optional**: move CMS routes to `createRoute()`. Ask the user whether they
   want this refactor, and only do it if they say yes.
4. **Verify**: compare the site's pages before and after, plus the build,
   type check and tests, and file issues for anything that's left.

Everything you need is in this file and one helper script. The full list of
v4 changes is at `https://rootjs.dev/docs/migration/v4/`.

## Ground rules

- Work on a new git branch, and commit each step separately so the user can
  review (or revert) them one at a time. Never push, deploy or publish unless
  the user asks.
- Don't opt the project in to the v2 translations manager. It's still
  experimental in v4, and the v1 translations system is the default. Only
  projects that already set `experiments: {v2TranslationsManager: true}` use
  it (see step 5).
- Never print, log, commit or paste secret values, including in GitHub
  issues. Refer to secrets by name.
- Ask before creating GitHub issues, and show the user what you'll file.
- The recommended changes (step 6) are refactors. Keep each one behavior
  preserving, and re-run the comparison after each.

## Step 1 — Check the project and agree on the plan

Run from the project root (the directory with `root.config.ts`). In a
monorepo, that's the site's package, not the repo root.

```bash
git status --short          # Should be clean. If not, ask the user.
git rev-parse --abbrev-ref HEAD
node --version              # v4 needs Node 24 or later.
ls pnpm-lock.yaml package-lock.json yarn.lock 2>/dev/null
grep -n '"@blinkk/' package.json
```

Use the package manager that matches the lockfile (the examples below use
pnpm). If the project uses the CMS (`cmsPlugin()` in `root.config.ts`), also
check that Google Cloud credentials work, since the dev server reads
Firestore:

```bash
gcloud auth application-default print-access-token > /dev/null && echo "adc ok"
```

If that fails, **ask the user to sign in themselves** (it opens a browser and
hangs a non-interactive shell). In Claude Code they can type
`! gcloud auth application-default login`.

Download the helper script into `.root/upgrade/`, and make sure `.root/` is
ignored by git (Root.js already keeps local state there):

```bash
mkdir -p .root/upgrade
curl -fsSL https://rootjs.dev/skills/root-v4-upgrade/scripts/root-v4-upgrade.mjs \
  -o .root/upgrade/root-v4-upgrade.mjs
grep -qxF '.root/' .gitignore || echo '.root/' >> .gitignore
```

If rootjs.dev is unreachable, the same file is at
`https://raw.githubusercontent.com/blinkk/rootjs/main/packages/root-cms/skills/root-v4-upgrade/scripts/root-v4-upgrade.mjs`.

Run the audit. It lists the packages to update, config flags that are now
defaults, whether the project uses the v2 translations manager, CMS routes and
data fetching to modernize, hard-coded secrets (values are redacted), and CI
jobs affected by v4:

```bash
node .root/upgrade/root-v4-upgrade.mjs audit | tee .root/upgrade/audit-before.md
```

The audit is a starting point, not the truth. Read the files it points to
before acting on a finding, and look for anything it can't see (e.g. routes in
a pod or a plugin).

Then summarize the plan for the user and ask, **in one message**:

| Question | Default |
| --- | --- |
| Branch name | `root-v4-upgrade` |
| Apply the recommended changes (secrets, batch requests), or only list them? | Apply, one commit each, after showing the plan for each |
| Move the CMS routes the audit lists to `createRoute()`? It's optional: the existing routes keep working on v4. Mention how many routes it would touch. | Don't refactor them (list them in the report instead) |
| Any pages that must be checked (e.g. the most important or most localized ones)? | Crawl the site from `/` |
| Only if the project already uses the v2 translations manager: is anyone editing translations in the CMS right now? (see step 5) | Ask |

Create the branch once they answer: `git checkout -b root-v4-upgrade`.

## Step 2 — Record the baseline (before upgrading)

Record what works **before** changing anything, so that after the upgrade you
only chase problems the upgrade caused.

1. **Checks.** Run the ones the project has, and note pass/fail for each in
   `.root/upgrade/baseline.md` (with the first error, if any):

   ```bash
   pnpm build                       # root build
   pnpm exec tsc --noEmit           # If there's a tsconfig.json.
   pnpm test                        # If package.json has a "test" script.
   pnpm lint                        # If package.json has a "lint" script.
   ```

   If the build fails before the upgrade, tell the user. Don't try to fix
   unrelated failures; just record them.

2. **Page snapshot.** Start the dev server on a spare port in the background
   (in Claude Code, use `run_in_background`), wait until it responds, and
   snapshot the site:

   ```bash
   PORT=4950 pnpm exec root dev
   # In another shell, once it's up:
   curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4950/
   node .root/upgrade/root-v4-upgrade.mjs snapshot \
     --base-url http://localhost:4950 --out .root/upgrade/before
   ```

   The snapshot crawls links and hreflang alternates from `/` (up to 300
   pages; raise it with `--max`). Check the page count and status codes it
   prints. If it missed pages, write a list of paths (one per line) to
   `.root/upgrade/paths.txt` and pass `--paths .root/upgrade/paths.txt`.
   Good sources: `dist/html/` after an SSG build, the site's `sitemap.xml`, or
   the CMS (`pnpm exec root-cms client.call listDocs '["Pages", {"mode":
   "published"}]'`). Include pages in several locales, since those show
   whether translations still load after the changes. For large sites, a few
   pages per route and locale is enough.

   Stop the dev server when the snapshot is done.

## Step 3 — Update the packages

Update every `@blinkk/root*` package to v4 in the same dependency section it's
in now (`dependencies` or `devDependencies`):

```bash
pnpm add @blinkk/root@^4 @blinkk/root-cms@^4
pnpm add @blinkk/root-password-protect@^4    # Only if it's already a dependency.
```

Then:

- If `.node-version`, `.nvmrc`, `engines.node` or a CI config pins Node below
  24, update it to 24.
- Remove the config flags v4 turns on by default (the audit lists them):
  `dependencyGraph: true`, `modulePreload: true` and
  `experiments.taskManager: true`. Leave any of these set to `false`; that's
  an opt-out.
- **Keep `experiments.v2TranslationsManager: true`** if it's set. The v2
  translations manager is still opt-in in v4, so removing the flag would
  switch the project back to v1 translations. Don't add it if it isn't set.
  `v2TranslationsManager: false` is the default and can be removed.
- If the project has a `root-cms.d.ts`, regenerate it with
  `pnpm exec root-cms generate-types`.
- If the project has installed Root.js agent skills (e.g.
  `.claude/skills/root-cms-cli`), refresh them with
  `pnpm exec root-cms skill.install --force`.

Run `pnpm build` and `pnpm exec tsc --noEmit` and fix any errors the upgrade
caused. If the project uses the v2 translations manager and its translations
haven't been migrated yet (see step 5), **don't start the dev server or run
`root build` with CMS access until step 5**: both run the migration
automatically, and it should be deliberate.

Commit: `chore: upgrade to root.js v4`.

## Step 4 — Know what else changed in v4

These need no code changes, but tell the user, since they show up in the CMS
or in the HTML:

- **Module preloading** is on, so pages get `<link rel="modulepreload">` tags.
- **The dependency graph** (references between docs) is on. It's kept up to
  date by the CMS cron job. If the project has no cron set up, see
  `https://rootjs.dev/docs/cms/#cron-jobs`.
- **The task manager** is on, with a Tasks page in the CMS sidebar.
- **EditorJS is removed.** Rich text always uses the Lexical editor; content
  doesn't change.
- **The CMS is rebranded** (Root.js name, pink accent, beet favicon). The
  `favicon`, `minimalBranding` and `themes` options of `cmsPlugin()` change it.
- **Translations don't change.** The v1 translations system is still the
  default, and the v2 translations manager is still opt-in.

## Step 5 — Check the translations migration (v2 translations manager only)

**Skip this step unless `root.config.ts` sets
`experiments: {v2TranslationsManager: true}`.** Projects on the v1
translations system (the default) keep their translations as they are.

The v2 translations manager stores translations in per-locale docs that are
drafted and published like content, instead of the v1 `Translations`
collection. When the flag is on, the CMS copies every v1 string into v2 and
publishes it, once. Projects that opted in on v3 have usually migrated
already, but check. The migration writes to the project's **production
Firestore**, so get an explicit go-ahead before running it. It's safe in these
ways:

- The v1 data is left in place as a backup.
- A live site that hasn't migrated yet keeps reading v1, so it isn't
  affected.
- It runs once. A lock in Firestore stops two runs at the same time, and a
  failed run resumes where it stopped.

It has one catch, which the user needs to know about: **it's a one-time
copy**. Translation edits made in the v1 CMS *after* the migration (e.g. by
editors using the deployed site's CMS before the upgrade is deployed) aren't
copied.
Options:

- Ask editors to pause translation edits until the upgrade is deployed
  (best).
- Or re-run with `--force` right before deploying. This re-copies v1 and
  **overwrites any edits made in the v2 translations manager since the first
  run**.

Check the status first. It's read-only:

```bash
pnpm exec root-cms translations.migrate --status
```

If it says `complete`, someone (or a dev server or build) already ran it.
Skip to step 6. If it says `running`, wait a few minutes and check again.
Otherwise, explain the above, **get a go-ahead**, then run:

```bash
pnpm exec root-cms translations.migrate
```

It prints a progress bar and a summary: strings migrated, translations docs,
unused strings pruned (strings no longer used by any doc), and a per-locale
table. If it fails, read the error. An auth error means the credentials
from step 1 are missing or lack access to the project. Re-running resumes
where it stopped.

Then verify the translations:

1. Start the v4 dev server and snapshot the site:

   ```bash
   PORT=4950 pnpm exec root dev
   node .root/upgrade/root-v4-upgrade.mjs snapshot \
     --base-url http://localhost:4950 --out .root/upgrade/after \
     --paths-from .root/upgrade/before
   node .root/upgrade/root-v4-upgrade.mjs compare \
     .root/upgrade/before .root/upgrade/after --out .root/upgrade/report.md
   ```

2. Read `.root/upgrade/report.md`. On localized pages, look for text that
   changed from a translation back to the source language. That means a
   string didn't migrate, or the page reads translations in a way the v2
   translations manager doesn't support (see step 6c).

3. **Code that reads v1 translations directly** (`loadTranslations()`,
   `loadTranslationsForLocale()`, flagged as an `[action]` by the audit) still
   works right after the migration, since v1 and v2 hold the same strings.
   But it serves stale strings as soon as someone edits a translation in the
   v2 translations manager.
   The comparison can't catch this, so fix every one of these (see step 6c).
   It's required, not optional.

## Step 6 — Recommended and optional changes

For each of these that the user agreed to in step 1, show the user what you'd change (files and a short
before/after), apply it if they agree, then re-run `snapshot` (to a fresh
`after` dir) and `compare`. The report should be unchanged by these refactors.
Commit each one separately.

### 6a. CMS routes → `createRoute()` (optional)

**Only do this if the user said yes in step 1.** If they said no, skip to 6b
and list the routes under "What's left" in the report. If they said yes,
still show the plan for each route (or group of similar routes) before
changing it, since this is the largest refactor in the upgrade.

A route that loads a CMS doc by hand in `handle` or `getStaticProps` (the
audit lists them) can usually be replaced by `createRoute()`. It handles
preview mode (`?preview=true`), locale resolution, translations (including
for referenced docs, with the v2 translations manager), 404s, `Cache-Control`, read caching and batched reads.

```tsx
// Before.
export const handle: Handler = async (req) => {
  const ctx = req.handlerContext;
  const slug = ctx.params.slug || 'index';
  const mode = String(req.query.preview) === 'true' ? 'draft' : 'published';
  const cmsClient = new RootCMSClient(req.rootConfig);
  const doc = await cmsClient.getDoc('Pages', slug, {mode});
  if (!doc) {
    return ctx.render404();
  }
  const locale = ctx.getPreferredLocale(doc.sys.locales || ['en']);
  const translations = await cmsClient.loadTranslationsForLocale(locale);
  return ctx.render({doc}, {locale, translations});
};

// After.
import {createRoute} from '@blinkk/root-cms';

export const {handle} = createRoute({
  collection: 'Pages',
  slugParam: 'slug',
});
```

The page component gets `props.doc` (plus `locale`, `mode`, `slug` and
anything from `fetchData`/`preRenderHook`). For SSG routes, use
`export const {getStaticProps, getStaticPaths} = createRoute({collection,
ssg: true})`. Map custom logic to options rather than dropping it:

| Custom logic in the old route | `createRoute()` option |
| --- | --- |
| Single doc route (e.g. `routes/index.tsx`) | `slug: 'index'` |
| Slug built from several params | `slugFormat: '[a]/[b]'` or `getSlug(params)` |
| Extra docs, lists, data sources, shared strings | `batchRequest(req, ctx)` + `preRenderHook` |
| Extra translations (e.g. `common`) | `translations: () => ({tags: ['common']})` |
| Custom locale logic (country, `?hl=`) | `resolveLocale(ctx)` |
| Region or flag-specific doc variant | `resolveDoc(ctx)` |
| Custom draft/published logic | `getMode(req)` |
| Redirects, custom status codes | `preRenderHook` with `props.$redirect` / `props.$statusCode` |
| Custom 404 page | `notFoundHook(req, res)` |
| Response headers | `setResponseHeaders`, `cacheControl` |
| Preview-only route | `previewOnly: true` |

On the v1 translations system (the default), `createRoute()` loads the
strings tagged `common`, the route's doc id, and any tags from the
`translations` option. A route that called `loadTranslationsForLocale(locale)`
with no tags (like the example above) loaded *every* string, so add the tags
of other docs the page renders (e.g. `translations: () => ({tags:
['Global/header']})`), and check localized pages in the comparison.

Check the old route's behavior that has no option (e.g. a non-default
`Cache-Control`, a fallback page, or a special case for the dev server) and
keep it. If several routes share options, put them in one object (e.g.
`utils/cms-route-options.ts`) and spread it into each `createRoute()` call.
Consider `cache: true` on SSR sites, which caches published reads in memory
for 60 seconds. Ask first, since it delays how fast publishes show up.

### 6b. Secrets → `root secrets`

Root.js v4 shares secrets through Google Cloud Secret Manager.
`.root.secrets.json` (committed) lists the managed env var names, the values
live in Secret Manager, and `root dev` syncs them into each developer's
`.env` (never committed). The audit lists hard-coded keys, committed `.env`
files, and env vars that aren't managed yet.

1. If there's no `.root.secrets.json` yet, create one. Ask the user for the
   GCP project (usually the one in `firebaseConfig.projectId`):

   ```bash
   pnpm exec root secrets init --gcp-project=<project-id> --gsm-key=<site-id>-env
   ```

2. For each secret, have the **user** store the value, so it never passes
   through your context. In Claude Code they can run it with `!`:

   ```
   ! pnpm exec root secrets set OPENAI_API_KEY
   ```

   If the values are already in a local `.env`, `pnpm exec root secrets push
   --keys NAME1,NAME2` uploads them without printing them. It asks for
   confirmation, so ask the user to run it.

3. Replace the literal in code with `process.env.NAME`, and make sure `.env`
   is in `.gitignore`. If a `.env` file is committed, remove it from git
   (`git rm --cached .env`) and tell the user that **its values are still in
   the git history and should be rotated**.

4. Update deployment so production gets the values. For App Engine with
   `root gae-deploy`, use `NAME: '{NAME}'` placeholders in `app.yaml`'s
   `env_variables`. Otherwise, use the host's secret config. Ask the user how
   they deploy rather than guessing.

Notes:

- The Firebase web `apiKey` in `firebaseConfig` identifies the project. It
  isn't a secret, since Firestore rules and IAM control access. Moving it
  to an env var is optional; it keeps it out of the repo and lets each
  environment use its own project. Don't present it as a leak.
- `sessionCookieSecret` set to a literal *is* a real secret. Move it to
  `SESSION_COOKIE_SECRET`.
- Service account key files (JSON with a `private_key`) shouldn't be in the
  repo at all. Production should use the runtime's service account. Tell the
  user to delete and rotate the key.

### 6c. Data fetching → batch requests

A page that makes several CMS reads one after another (`getDoc`, `listDocs`,
`getFromDataSource`, …) pays a Firestore round trip for each. A batch request
fetches docs, queries and data sources in parallel. With the v2 translations
manager, it also loads the translations for every doc it returns, for the
requested locales only. **Batch request translations only read v2
translations**, so on the v1 translations system (the default), keep loading
translations with `loadTranslationsForLocale()` and use batch requests for
the content only.

In routes that use `createRoute()` (already, or after 6a), use the
`batchRequest` option:

```tsx
// Before: fetched after the route's doc, without translations.
createRoute({
  collection: 'Guides',
  fetchData: (ctx) => ({
    header: ctx.cmsClient.getDoc('Global', 'header', {mode: ctx.mode}),
    guides: ctx.cmsClient
      .listDocs('Guides', {mode: ctx.mode})
      .then((res) => res.docs),
  }),
});

// After: one batch with the route's doc and translations.
createRoute({
  collection: 'Guides',
  batchRequest: (req) => {
    req.addDoc('Global/header');
    req.addQuery('guides', 'Guides', {orderBy: 'sys.publishedAt'});
  },
  preRenderHook: (props, ctx) => ({
    ...props,
    header: ctx.batchResponse!.getDoc('Global/header'),
    guides: ctx.batchResponse!.getQuery('guides'),
  }),
});
```

Outside `createRoute()` (custom handlers, plugins, `getStaticProps`), and, on
the v2 translations manager only, to replace any
`loadTranslations()`/`loadTranslationsForLocale()` call:

```ts
const req = cmsClient.createBatchRequest({mode, translate: true, locales: [locale]});
req.addDoc('Pages/index');
req.addTranslations('common');   // A v1 tag, now a v2 translations id.
const res = await req.fetch();
const doc = res.getDoc('Pages/index');
const translations = res.getTranslations(locale);
```

If the locale depends on the doc (e.g. `ctx.getPreferredLocale(doc.sys.locales)`),
fetch the content first and the translations second:
`const res = await req.fetchContent();` then, once the locale is known,
`await req.fetchTranslations(res, {locales: [locale]});`.

On the v1 translations system, drop `translate: true` and `addTranslations()`,
and keep the existing `loadTranslationsForLocale(locale, {tags})` call.

Notes:

- On v2: v1 translations were filtered by tag. In v2, each doc's strings
  live under the doc's id (e.g. `Pages/index`). Other v1 tags (e.g. `common`) became
  translations ids with the same name. `loadTranslationsForLocale(locale)`
  with no tags loaded *every* string. The batch equivalent is the docs on
  the page, which is what createRoute() loads.
- Read results with the response's getters, which take the same ids you
  added: `getDoc('Collection/slug')` (or `null`), `getQuery(queryId)` (or
  `[]`), and `getDataSource(id)` (or `null`). Older v4 releases don't have
  the getters; if `getDoc` is missing, use the `docs`, `queries` and
  `dataSources` maps, keyed the same way.
- `BatchRequest` options and methods: `addDoc(docId)`,
  `addQuery(id, collection, {limit, offset, orderBy, orderByDirection, query})`,
  `addDataSource(id)`, `addTranslations(id)`; response: `getDoc(id)`,
  `getQuery(id)`, `getDataSource(id)`, `getTranslations(locale)`.

## Step 7 — Final checks

With every change in place:

1. Re-run the checks from step 2 (`build`, `tsc --noEmit`, `test`, `lint`)
   and compare with `.root/upgrade/baseline.md`. Only new failures count
   against the upgrade.
2. Take a final snapshot (`--out .root/upgrade/after-final --paths-from
   .root/upgrade/before`) and compare it with `before`.
3. Triage every `critical` and `major` page in the report:
   - **Caused by the upgrade**: fix it, or explain why it's expected.
   - **Content published between the snapshots**: confirm by reading the doc
     in the CMS, and note it.
   - **Can't tell**: note it for the user, with the page and the diff.

   Expected differences: `modulepreload` tags and asset hashes are already
   ignored. `Cache-Control` changes on routes moved to `createRoute()` are
   expected if the old route set none.
4. Re-run the audit (`audit | tee .root/upgrade/audit-after.md`). Every
   remaining `[action]` needs a reason.
5. Stop the dev servers you started.

## Step 8 — Report, and offer to file issues

Give the user a short summary:

- Versions before and after, and the commits on the branch.
- If the project uses the v2 translations manager: the translations
  migration status (or result, if you ran it) and how you verified it.
- Check results (build, types, tests, lint) before vs. after.
- The comparison: pages checked and how each critical/major change was
  resolved.
- What's left: recommended changes not applied, items to verify in
  production, secrets to rotate.
- Before deploying: make sure production has every env var that moved to
  `root secrets`. If you ran the translations migration, deploy soon after it
  (see step 5).

Then **offer** to create GitHub issues, and wait for an answer:

- **In the project's repo**, one issue per open item (e.g. "Move
  routes/blog/[slug].tsx to createRoute()", "Rotate the key that was in
  .env"). Each should be
  self-contained: what, why, where (files and lines), and how to fix.
- **In `blinkk/rootjs`**, for problems that look like Root.js bugs (e.g.
  a page that renders differently with no project change to explain it). Include the
  Root.js versions, Node version, the minimal steps or code to reproduce, and
  the relevant part of the diff. Leave out private content, URLs and secrets.

Before creating any:

```bash
gh auth status
gh repo view --json nameWithOwner -q .nameWithOwner
gh issue list --state open --search "<keywords>"   # Avoid duplicates.
```

Show the titles and bodies you plan to file, let the user pick, and create
them with `gh issue create --title ... --body-file ...`. Share the links.
If `gh` isn't installed or signed in, give the user the drafts as Markdown
instead.

## Guidance for agents

- Ask the step 1 questions together, once. Then work through the steps
  without asking again, except for the go-aheads: the translations migration
  (v2 translations manager only), applying each recommended change, the
  optional `createRoute()` refactor, and filing issues. Never move routes to
  `createRoute()` without a yes.
- Snapshot **before** upgrading. Once the packages are updated, there's no
  way to get a clean baseline.
- Don't opt the project in to the v2 translations manager, and don't remove
  the flag from a project that has it. If it's on and the migration hasn't
  run, don't run `root dev` or `root build` on v4 before step 5 unless the
  user agrees. Both run the migration automatically.
- Keep refactors behavior preserving. When unsure what custom route logic
  does, keep it (as a `createRoute()` option or a hook) and mention it.
- If the comparison shows many changes, look for a single cause before
  fixing pages one by one (e.g. a layout reading translations that
  `createRoute()` doesn't load, or a config flag).
- Never print or commit secret values, and never put them in an issue.
