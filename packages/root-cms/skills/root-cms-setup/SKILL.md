---
name: root-cms-setup
description: >-
  Set up a new Root.js site with the CMS (@blinkk/root-cms), or connect an
  existing Root.js project to Google Cloud: scaffold it with create-root, run
  the `root-cms setup` wizard (Firebase, Firestore, storage, IAM and secrets),
  check that the CMS loads, and hand off. Use this when asked to "create a
  Root.js site", "set up Root.js", "set up the Root CMS", "connect the CMS to
  Firebase/Google Cloud", or to run `root-cms setup`.
---

# Setting up a Root.js site with the CMS

The goal is a project that runs locally with `pnpm dev`, a CMS at
`http://localhost:4007/cms/` the user can sign in to, and a Google Cloud
project with everything the CMS needs. Most of it is scripted by two commands:

- `pnpm create @blinkk/root` scaffolds the project from a template.
- `root-cms setup` sets up the Google Cloud project. It's safe to run again:
  every step checks what exists and skips it.

Three things need the user, because they happen in a browser or decide who
pays: signing in to gcloud, choosing the billing account for a new project,
and turning on Google sign-in in the Firebase console. Plan around them rather
than discovering them halfway through.

## Step 1 — Agree on the plan

Ask the user these questions together, once, before running anything. Offer
the defaults so they can just say "yes".

| Question | Default |
| --- | --- |
| Directory for the site | `my-site` |
| Template: `starter` (CMS, a `Pages` collection and templates) or `minimal` (no CMS) | `starter` |
| Google Cloud project: an existing project id, or a new one to create | none, must ask |
| Site id (namespaces this site's content, uploads and secrets, so several sites can share one project) | the directory name |
| Region for Firestore and storage | `us-central1` |

If they pick `minimal`, scaffold it (step 3), install, start the dev server
and stop there. The rest of this skill is for the CMS.

Tell them what they'll do by hand, so it's not a surprise: sign in to gcloud
in their browser, and flip one switch in the Firebase console.

## Step 2 — Check the tools and the sign-in

```bash
node --version    # Must be v24 or later.
pnpm --version    # If missing: corepack enable
gcloud --version  # If missing: https://cloud.google.com/sdk/docs/install
```

Then check that both gcloud and Application Default Credentials (which the
CMS server uses to reach Firestore) are signed in:

```bash
gcloud auth list --filter=status:ACTIVE --format="value(account)"
gcloud auth application-default print-access-token > /dev/null && echo "adc ok"
```

If either is missing, **ask the user to run the login themselves**. Both open
a browser and wait for it, which hangs a non-interactive shell. In Claude
Code, they can type `!` before a command to run it in the session:

```
! gcloud auth login
! gcloud auth application-default login
```

Both should use the same Google account. Re-run the checks before moving on.

## Step 3 — Scaffold the project

```bash
pnpm create @blinkk/root@latest my-site --skip-gcp-setup
cd my-site
pnpm install
```

`--skip-gcp-setup` stops create-root from offering the wizard
interactively; you run it yourself in the next steps, with flags.

If the project has no `.gitignore`, add one before anything writes secrets,
since the wizard puts a session secret in `.env`:

```
node_modules/
dist/
.env
.env.*
```

Run `git init` if the directory isn't a repo yet.

## Step 4 — Create the Google Cloud project (new projects only)

Skip this step for an existing project. The wizard only creates projects when
it asks interactively, so create one with gcloud:

```bash
gcloud projects create my-project-id --name="My Site"
```

Project ids are global: 6–30 characters, lowercase letters, digits and
hyphens. If the id is taken, ask the user for another.

A new project needs billing, because Secret Manager and the storage bucket
require it (low-traffic sites usually stay in the free tier). List the open
billing accounts and **ask the user which one to use**; never pick one for
them:

```bash
gcloud billing accounts list --filter=open=true
gcloud billing projects link my-project-id --billing-account=XXXXXX-XXXXXX-XXXXXX
```

If there are no open accounts, send the user to
`https://console.cloud.google.com/billing` to create one, and wait.

## Step 5 — Run the setup wizard

Do a dry run first. It prints every change without making any:

```bash
pnpm exec root-cms setup \
  --project my-project-id \
  --site-id my-site \
  --location us-central1 \
  --yes --dry-run
```

Summarize the plan for the user and get a go-ahead, then run it for real by
dropping `--dry-run`. It can take a few minutes on a new project while APIs
turn on and the database is created.

`--yes` takes the default answer to every question. The defaults are the safe
ones, so it's fine to use, but know what they do:

- It enables the APIs, adds Firebase, creates the Firestore database and
  registers a web app, then writes the `cmsPlugin()` `id` and
  `firebaseConfig` into `root.config.ts`.
- It releases the CMS's Firestore and storage rules **only if the project has
  none**. If different rules are live (another app uses the project), it
  leaves them and adds a to-do.
- If the site id already exists on the project and the user isn't a member, it
  stops rather than join someone else's site. Ask the user for a different site
  id and run it again.
- It makes uploaded files in the storage bucket publicly readable, because CMS
  image and file fields link to them directly. Mention this to the user.
- It creates a runtime service account for the site and a `.root.secrets.json`
  manifest, and stores a generated session cookie secret in Secret Manager and
  `.env`.

The wizard ends with a summary and, sometimes, a **Still to do** list. Read it
and act on every item.

### The Google sign-in switch

Google has no API for turning on Google sign-in, so with `--yes` the wizard
skips it and adds a to-do with a link like
`https://console.firebase.google.com/project/<id>/authentication/providers`.
Give the user that link and these steps, then wait for them:

1. Click **Get started** if it's there.
2. Click **Google**, turn on **Enable**, pick a support email and click
   **Save**.

Then run the wizard again with the same flags (without `--dry-run`). It skips
the finished steps and confirms that sign-in is on. Repeat until the summary
has no to-dos you can act on.

### If the wizard fails

It prints the error and stops; nothing after the failed step has run. Fix the
cause and run it again. Common causes:

| Error | Fix |
| --- | --- |
| `Project ... was not found, or ... can't access it` | Wrong id, or the signed-in account isn't an owner/editor on it. |
| `No open billing accounts found` | Step 4: link a billing account. |
| `--yes was passed but "..." has no default` | A flag is missing; pass `--project` and `--site-id`. |
| `PERMISSION_DENIED` from Firestore | Run `gcloud auth application-default set-quota-project my-project-id`, and check that ADC uses the same account as gcloud. |

## Step 6 — Check that it works

```bash
grep -n "YOUR_FIREBASE" root.config.ts   # Should print nothing.
ls .root.secrets.json                    # Should exist.
```

Start the dev server in the background (in Claude Code, use
`run_in_background`) and check both pages respond:

```bash
pnpm dev
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4007/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4007/cms/
```

`/` shows a welcome page until there's a home page, which is expected. Ask the
user to open `http://localhost:4007/cms/` and sign in with the account they
used for gcloud. The wizard made that account an ADMIN.

## Step 7 — Install the content skills

```bash
pnpm exec root-cms skill.install
```

This copies the Root.js skills (including this one) into the project's agent
skills directory, so future sessions can read and edit CMS content with
`root-cms client.call` and propose changes for review. Commit them.

## Step 8 — Create the home page (if the user wants)

Offer to create the home page, so `/` shows real content. `Pages/index`
renders at `/`, and any other slug renders at its own path. In the starter,
the page's modules come from the templates in `templates/`:

```bash
npx root-cms client.call saveDraftData '["Pages/index", {
  "meta": {"title": "My Site"},
  "content": {"modules": [
    {"_type": "TemplateHero", "title": "Hello, world", "body": "Edit this page in the CMS."}
  ]}
}]'
```

Check the result envelope's `ok`, then preview the draft at
`http://localhost:4007/?preview=true`. Publishing makes it live, so ask before
running:

```bash
npx root-cms client.call publishDocs '[["Pages/index"]]'
```

## Step 9 — Commit and hand off

Commit the project, including `root.config.ts`, `.root.secrets.json` and the
installed skills. Check that `.env` is **not** staged.

Finish with a short summary for the user:

- The GCP project, site id and CMS URL.
- Anything left on the wizard's "Still to do" list.
- For deploying: run the server with the site's service account (shown in the
  wizard's summary) as its runtime identity. See
  `https://rootjs.dev/docs/deployment/`.
- Teammates who clone the repo run `pnpm install`, sign in with gcloud, and
  run `pnpm dev`, which syncs `.env` from Secret Manager. An admin adds them
  in the CMS under Settings.
- What to try next, e.g. "add a template for a feature grid" or "add a blog
  collection".

## Adding templates afterwards

A starter page is a list of modules. The `Pages` collection offers every
`templates/<Name>/<Name>.schema.ts` file, and `PageModules` renders each module
with the component exported as `<Name>` from `templates/<Name>/<Name>.tsx`, so
a new folder needs no registration. Copy `templates/TemplateHero/` as a model:
a schema, a component and a stylesheet, all named after the template. Then
regenerate the types:

```bash
pnpm exec root-cms generate-types
```

See `https://rootjs.dev/docs/cms/schemas/` for every field type.

## Guidance for agents

- Ask the step 1 questions together, up front. Don't guess a GCP project id or
  billing account.
- Never run `gcloud auth login` or `gcloud auth application-default login`
  yourself; ask the user to.
- Dry-run the wizard and get a go-ahead before the real run. Creating a project,
  linking billing, and publishing are side effects to confirm first.
- The wizard is idempotent. When something fails or a to-do is fixed, run it
  again rather than repeating its steps by hand.
- Never print or commit the contents of `.env`.
