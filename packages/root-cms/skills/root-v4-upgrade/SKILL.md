---
name: root-v4-upgrade
description: >-
  Upgrade a Root.js project (@blinkk/root, @blinkk/root-cms) from v3 to v4:
  snapshot the site before changing anything, update the packages, run the v1
  -> v2 translations migration, move CMS routes to createRoute(), move secrets
  to the Root.js secrets manager, batch CMS data fetching, then compare the
  site before and after and offer to file GitHub issues for anything left.
  Use this when asked to "upgrade to Root.js v4", "migrate to Root v4", or to
  follow https://rootjs.dev/skills/root-v4-upgrade.md.
---

# Upgrading a Root.js project to v4

The goal is a project on Root.js v4 that renders the same pages as before,
with its translations in the v2 translations manager, and a short report of
what changed, what was tested and what's left. The parts:

1. **Required**: update the packages, and migrate the CMS translations from v1
   to the v2 translations manager.
2. **Recommended**: move CMS routes to `createRoute()`, move secrets to
   `root secrets`, and load CMS data with batch requests. Suggest these and
   apply the ones the user agrees to.
3. **Verify**: compare the site's pages before and after, plus the build,
   type check and tests, and file issues for anything that's left.

Everything you need is in this file and one helper script. The full list of
v4 changes is at `https://rootjs.dev/docs/migration/v4/`.

## Ground rules

- Work on a new git branch, and commit each step separately so the user can
  review (or revert) them one at a time. Never push, deploy or publish unless
  the user asks.
- The translations migration writes to the project's **production
  Firestore**. Get an explicit go-ahead before running it (step 5).
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
check that Google Cloud credentials work, since both the dev server and the
migration read Firestore:

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
defaults, CMS routes and data fetching to modernize, hard-coded secrets
(values are redacted), and CI jobs affected by v4:

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
| Apply the recommended changes (createRoute, secrets, batch requests), or only list them? | Apply, one commit each, after showing the plan for each |
| Any pages that must be checked (e.g. the most important or most localized ones)? | Crawl the site from `/` |
| Is anyone editing translations in the CMS right now? (see step 5) | Ask |

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
   whether the translations migration worked. For large sites, a few pages
   per route and locale is enough.

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
  `experiments.v2TranslationsManager: true`, `dependencyGraph: true`,
  `modulePreload: true` and `experiments.taskManager: true`. Leave any flag
  set to `false`; that's an opt-out. If `v2TranslationsManager: false` is
  set, ask the user whether to remove it. Without removing it, the
  translations stay on v1 and step 5 doesn't apply.
- If the project has a `root-cms.d.ts`, regenerate it with
  `pnpm exec root-cms generate-types`.
- If the project has installed Root.js agent skills (e.g.
  `.claude/skills/root-cms-cli`), refresh them with
  `pnpm exec root-cms skill.install --force`.

Run `pnpm build` and `pnpm exec tsc --noEmit` and fix any errors the upgrade
caused. **Don't start the dev server or run `root build` with CMS access yet
if the translations haven't been migrated.** In v4, both run the migration
automatically, and step 5 should be deliberate. If the build needs Firestore
and you haven't reached step 5, do step 5 first.

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
- **`root build` needs Firestore access**, because it runs the translations
  migration before building. CI jobs that build the site need application
  default credentials or `GOOGLE_APPLICATION_CREDENTIALS` (the audit lists
  the CI files that build).

## Step 5 — Migrate the translations (CMS projects only)

v4 stores translations in the v2 translations manager (per-locale docs that
are drafted and published like content) instead of the v1 `Translations`
collection. The migration copies every v1 string into v2 and publishes it.
It's safe in these ways:

- The v1 data is left in place as a backup.
- The live v3 site keeps reading v1, so it isn't affected.
- It runs once. A lock in Firestore stops two runs at the same time, and a
  failed run resumes where it stopped.

It has one catch, which the user needs to know about: **it's a one-time
copy**. Translation edits made in a v3 CMS *after* the migration (e.g. by
editors using the deployed site's CMS before v4 is deployed) aren't copied.
Options:

- Ask editors to pause translation edits until v4 is deployed (best).
- Or re-run with `--force` right before deploying v4. This re-copies v1 and
  **overwrites any edits made in the v2 translations manager since the first
  run**.

Check the status first. It's read-only:

```bash
pnpm exec root-cms translations.migrate --status
```

If it says `complete`, someone (or a v4 dev server or build) already ran it.
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

Then verify the translations, which is the most important check in this
upgrade:

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
   string didn't migrate, or the page reads translations in a way v4
   doesn't support (see "Data fetching" below).

3. **Code that reads v1 translations directly** (`loadTranslations()`,
   `loadTranslationsForLocale()`, flagged as an `[action]` by the audit) still
   works right after the migration, since v1 and v2 hold the same strings.
   But it serves stale strings as soon as someone edits a translation in v4.
   The comparison can't catch this, so fix every one of these (see step 6c).
   It's required, not optional.

## Step 6 — Recommended changes

For each of these, show the user what you'd change (files and a short
before/after), apply it if they agree, then re-run `snapshot` (to a fresh
`after` dir) and `compare`. The report should be unchanged by these refactors.
Commit each one separately.

### 6a. CMS routes → `createRoute()`

A route that loads a CMS doc by hand in `handle` or `getStaticProps` (the
audit lists them) can usually be replaced by `createRoute()`. It handles
preview mode (`?preview=true`), locale resolution, translations (including
for referenced docs), 404s, `Cache-Control`, read caching and batched reads.

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
`getFromDataSource`, `loadTranslations`, …) pays a Firestore round trip for
each. A batch request fetches docs, queries, data sources and translations in
parallel, and loads the translations for every doc it returns (v2
translations, for the requested locales only).

Inside `createRoute()`, use the `batchRequest` option:

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
    header: ctx.batchResponse!.docs['Global/header'],
    guides: ctx.batchResponse!.queries.guides,
  }),
});
```

Outside `createRoute()` (custom handlers, plugins, `getStaticProps`), and to
replace any `loadTranslations()`/`loadTranslationsForLocale()` call:

```ts
const req = cmsClient.createBatchRequest({mode, translate: true, locales: [locale]});
req.addDoc('Pages/index');
req.addTranslations('common');   // A v1 tag, now a v2 translations id.
const res = await req.fetch();
const doc = res.docs['Pages/index'];
const translations = res.getTranslations(locale);
```

If the locale depends on the doc (e.g. `ctx.getPreferredLocale(doc.sys.locales)`),
fetch the content first and the translations second:
`const res = await req.fetchContent();` then, once the locale is known,
`await req.fetchTranslations(res, {locales: [locale]});`.

Notes:

- v1 translations were filtered by tag. In v2, each doc's strings live under
  the doc's id (e.g. `Pages/index`). Other v1 tags (e.g. `common`) became
  translations ids with the same name. `loadTranslationsForLocale(locale)`
  with no tags loaded *every* string. The batch equivalent is the docs on
  the page, which is what createRoute() loads.
- Check the result keys. The batch response is keyed by doc id
  (`Collection/slug`) and query id, not by the old variable names.
- `BatchRequest` options and methods: `addDoc(docId)`,
  `addQuery(id, collection, {limit, offset, orderBy, orderByDirection, query})`,
  `addDataSource(id)`, `addTranslations(id)`; response: `docs`, `queries`,
  `dataSources`, `getTranslations(locale)`.

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
- The translations migration result (strings, docs, locales) and how you
  verified it.
- Check results (build, types, tests, lint) before vs. after.
- The comparison: pages checked and how each critical/major change was
  resolved.
- What's left: recommended changes not applied, items to verify in
  production, CI credentials for `root build`, secrets to rotate.
- Before deploying: deploy the v4 site soon after the migration (see step 5),
  and make sure production has every env var that moved to `root secrets`.

Then **offer** to create GitHub issues, and wait for an answer:

- **In the project's repo**, one issue per open item (e.g. "Move
  routes/blog/[slug].tsx to createRoute()", "Give CI access to Firestore for
  root build", "Rotate the key that was in .env"). Each should be
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
  without asking again, except for the go-aheads: the migration, applying
  each recommended change, and filing issues.
- Snapshot **before** upgrading. Once the packages are updated, there's no
  way to get a clean baseline.
- Don't run `root dev` or `root build` on v4 before step 5 unless the user
  agrees. Both run the translations migration automatically.
- Keep refactors behavior preserving. When unsure what custom route logic
  does, keep it (as a `createRoute()` option or a hook) and mention it.
- If the comparison shows many changes, look for a single cause before
  fixing pages one by one (e.g. a layout reading v1 translations, or a
  config flag).
- Never print or commit secret values, and never put them in an issue.
