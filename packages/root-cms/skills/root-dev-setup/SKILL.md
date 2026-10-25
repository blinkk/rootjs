---
name: root-dev-setup
description: >-
  Get a freshly cloned, existing Root.js project running on this machine: check
  Node.js, pnpm and the gcloud CLI, sign in to gcloud and Application Default
  Credentials, install dependencies, sync `.env` from Secret Manager, check
  access to the project's Firestore and CMS, and start the dev server. Use
  this when asked to "set up this repo", "get this project running", "onboard
  me", "set up my machine for this site", or after cloning a Root.js project
  that someone else already set up. For creating a new site or connecting a
  project to Google Cloud for the first time, use root-cms-setup instead.
---

# Setting up a cloned Root.js project

The goal is a working local checkout of a project that already exists: the
dev server runs with `pnpm dev`, `.env` holds the team's shared secrets, and
the user can sign in to the CMS at `http://localhost:4007/cms/`.

The project's Google Cloud setup is already done, and other people depend on
it. This skill only sets up **this machine**: it never creates projects,
changes IAM, releases security rules, edits `root.config.ts` or runs the
`root-cms setup` wizard. If something is missing on the Google Cloud side,
find out what and tell the user who to ask.

Assume the machine is new: tools may be missing, out of date, or signed in to
the wrong Google account. Check each one rather than assuming.

Two things need the user, because they happen in a browser: signing in to
gcloud, and signing in to Application Default Credentials. A third may need
someone else: a project admin granting access. Plan around them.

## Step 1 — Read the project

Run everything from the repo root unless the project lives in a subdirectory
(look for `root.config.ts`; in a monorepo, it may be under `sites/` or
`packages/`). Then read, before running anything:

- `README.md`, `CONTRIBUTING.md`, `AGENTS.md` or `CLAUDE.md`. Project-specific
  setup steps win over this skill's defaults; follow them where they differ.
- `package.json`: the `packageManager` field, the `engines.node` range, the
  versions of `@blinkk/root` and `@blinkk/root-cms`, and the scripts (`dev`,
  `build`, any `setup` or `postinstall` script).
- The lockfile, to confirm the package manager: `pnpm-lock.yaml` means pnpm.
  If you only find `package-lock.json` or `yarn.lock`, use that tool instead
  of pnpm in the steps below.
- `.node-version` or `.nvmrc`, if there is one.
- `root.config.ts`: whether it uses `cmsPlugin()`. If it does, note the
  plugin's `id` (the **site id**) and `firebaseConfig.projectId` (the **GCP
  project**). If those still read `YOUR_FIREBASE_PROJECT_ID` or the site id is
  `starter`, the project was never connected to Google Cloud; stop and tell the
  user this needs `root-cms setup` (the root-cms-setup skill) by someone who
  owns the GCP project, not this skill.
- `.root.secrets.json`: whether it exists. If it does, note `gcpProjectId` and
  `gsmKey`, and any `import` of a shared manifest. This is how the team shares
  `.env`.
- `.env.example` or similar, if there's no `.root.secrets.json`.

A project **without** `cmsPlugin()` and without `.root.secrets.json` doesn't
need gcloud at all: do steps 2 and 4, skip to step 7, and skip the CMS checks.

## Step 2 — Check the tools

```bash
node --version    # Must match engines.node / .node-version (v24+ for Root.js v4).
pnpm --version    # Should match the packageManager field, if set.
gcloud --version  # Needed for the CMS and for shared secrets.
git --version
```

Fix what's missing or too old. Ask before installing anything system-wide,
and prefer what the user already uses (Homebrew, a Node version manager):

| Tool | If missing or wrong |
| --- | --- |
| Node.js | With a version manager that's already installed: `fnm use`, `nvm use`, or `volta install node@24`. Otherwise suggest one, or `https://nodejs.org/`. |
| pnpm | `corepack enable` (ships with Node 24), then re-check. Corepack installs the version in `packageManager`. If corepack isn't available: `npm install -g pnpm`. |
| gcloud | macOS with Homebrew: `brew install --cask google-cloud-sdk`. Otherwise: `https://cloud.google.com/sdk/docs/install`. Open a new shell (or source the installer's path script) so `gcloud` is on the `PATH`. |

A new Node version in a new shell may need the version manager's shell hook;
if `node --version` still shows the old version, tell the user rather than
fighting the shell.

## Step 3 — Sign in to Google Cloud

Skip this step for projects that don't use the CMS or `root secrets`.

Two separate sign-ins are needed, and both should use the **same Google
account**, the one the user's team added to the project:

- The **gcloud CLI** account, used by `root secrets` (Secret Manager) and to
  attribute CLI edits.
- **Application Default Credentials** (ADC), used by the CMS server and the
  `root-cms` CLI to reach Firestore.

```bash
gcloud auth list --filter=status:ACTIVE --format="value(account)"
gcloud auth application-default print-access-token > /dev/null && echo "adc ok"
```

Show the user the active account and ask whether it's the right one for this
project; a work project usually needs a work account, not a personal one.

If either sign-in is missing, or uses the wrong account, **ask the user to run
the login themselves**. Both open a browser and wait for it, which hangs a
non-interactive shell. In Claude Code, they can type `!` before a command to
run it in the session:

```
! gcloud auth login
! gcloud auth application-default login
```

If gcloud has several accounts and the right one is just not active, switch
instead of signing in again: `gcloud config set account you@example.com`. To
check which account ADC uses, decode it from the token:

```bash
curl -s "https://oauth2.googleapis.com/tokeninfo?access_token=$(gcloud auth application-default print-access-token)" | grep '"email"'
```

Then point the ADC quota project at the site's GCP project, which avoids
`PERMISSION_DENIED` errors from Firestore with user credentials. It only
changes the local credentials file:

```bash
gcloud auth application-default set-quota-project my-project-id
```

If that fails with a permission error, carry on; it's a symptom to come back
to in step 6, not a blocker yet. Optionally, set gcloud's default project so
ad hoc commands target the right place (ask first if the user already has a
different default):

```bash
gcloud config set project my-project-id
```

## Step 4 — Install dependencies

```bash
pnpm install
```

Use `--frozen-lockfile` if the README or CI does; never delete or regenerate
the lockfile on a fresh clone. If the install fails on the Node version or an
`engines` check, go back to step 2 rather than passing `--force` or ignoring
engines. If a `postinstall` or build step fails, read the error and the
README before changing anything.

## Step 5 — Sync the shared secrets

Skip this step if there's no `.root.secrets.json`. The project's `.env` file
isn't committed; `root secrets` downloads it from Secret Manager:

```bash
pnpm exec root secrets status   # Lists the managed keys (no network).
pnpm exec root secrets sync     # Writes them into .env.
```

`root dev` also syncs on start, but it skips the sync after a short timeout or
an error and starts anyway, which hides the cause. Run `sync` yourself so any
error is visible.

| Error | Meaning |
| --- | --- |
| `gcloud ... was not found` | Back to step 2. |
| `UNAUTHENTICATED` | gcloud isn't signed in; back to step 3. |
| `PERMISSION_DENIED` | The account has no access to the project's secrets. See step 6. |
| `NOT_FOUND` for the project | Wrong account, or the project id in `.root.secrets.json` is wrong. Don't edit the manifest; ask the user. |

If the project has no `.root.secrets.json` but needs a `.env` (an
`.env.example`, or the README says so), ask the user where the team keeps the
values. Never invent secret values or copy them from another project.

Never print, log, paste or commit the contents of `.env`. Check that `.env` is
gitignored (`git check-ignore .env`); if it isn't, tell the user.

## Step 6 — Check access to the CMS

Skip this step for projects without `cmsPlugin()`.

Two kinds of access are needed, granted by different people:

1. **Google Cloud IAM** on the GCP project, so the local CMS server (through
   ADC) can read and write Firestore and storage, and `root secrets` can read
   Secret Manager. A project owner grants this in the Google Cloud console.
2. **A role in the CMS** (`ADMIN`, `EDITOR`, `CONTRIBUTOR` or `VIEWER`), so the
   user can sign in to the CMS UI. A CMS admin adds them under Settings in the
   CMS.

Check both at once by asking Firestore for the user's CMS role:

```bash
pnpm exec root-cms client.call getUserRole '["you@example.com"]'
```

Use the gcloud account from step 3. Read the result envelope:

- `"ok": true` with a role as the `result`: everything is in place.
- `"ok": true` with a `null` result: IAM works, but the user isn't a CMS
  member yet. They need a CMS admin to add them under Settings (a domain-wide
  entry like `*@example.com` also counts).
- `"ok": false` with `PERMISSION_DENIED` or a similar error: IAM is missing or
  ADC uses another account. Re-check step 3 (same account for gcloud and ADC, quota project
  set). If it still fails, the account needs IAM access to the project.

When access is missing, **don't try to grant it**, even if the user's account
can: changing IAM or the CMS's members is a decision for the project's
owners. Give the user a short message they can send to their project admin,
for example:

> Please give `you@example.com` access to the `my-site` site on the
> `my-project-id` Google Cloud project: Firestore and Storage access (e.g. the
> Cloud Datastore User and Storage Object User roles, or Editor), Secret
> Manager Secret Accessor for the site's secrets, and a role in the CMS under
> Settings.

Then carry on with step 7; the site itself usually renders without CMS access,
which is still useful to confirm.

## Step 7 — Start the dev server

Start it in the background (in Claude Code, use `run_in_background`) and check
it responds:

```bash
pnpm dev
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4007/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4007/cms/   # CMS projects only.
```

If port 4007 is taken, the server picks another one; read the URL it prints.
Read the server's output, not just the status codes: look for a
`secrets: sync skipped` line, Firestore errors, or failed imports. A `500` on
`/` often means a route's data fetch failed (no CMS access yet, or a missing
`.env` value), so connect it to steps 5 and 6 before debugging code.

If the project's README says to run other checks (a build, type check or
tests), run the fast ones now so the user knows the checkout is healthy:

```bash
pnpm build      # Only if quick, or if the README asks for it.
```

For a CMS project, ask the user to open `http://localhost:4007/cms/` and sign
in with the same Google account. If the CMS won't let them in, that's the CMS
role from step 6.

## Step 8 — Hand off

Leave the dev server running if the user wants to keep working; otherwise stop
it. Don't commit anything: a fresh setup shouldn't change tracked files. If
`git status` shows changes (a reformatted lockfile, a regenerated file), tell
the user rather than committing or discarding them.

Finish with a short summary:

- What's installed and the versions (Node, pnpm, gcloud).
- The Google account signed in to gcloud and ADC, and the GCP project.
- Whether secrets synced, and how many keys (names only, never values).
- The local URLs, and whether the CMS sign-in works.
- Anything left, with who to ask: e.g. "waiting on an admin to add you to the
  CMS" or "ask the team for the `.env` values".
- If the project has no agent skills installed yet (no `root-cms-cli` skill in
  `.claude/skills` or `.agent/skills`) and uses the CMS, mention
  `pnpm exec root-cms skill.install` for reading and editing content from the
  command line.

## Guidance for agents

- This is for an existing project. Never run `root-cms setup`, `gcloud projects
  create`, `gcloud billing ...`, IAM changes or `root secrets push`/`set`, and
  never edit `root.config.ts` or `.root.secrets.json` to make setup work.
- Never run `gcloud auth login` or `gcloud auth application-default login`
  yourself; ask the user to. Confirm the account before relying on it.
- Ask before installing system-wide software or changing global config (the
  default gcloud project, the global Node version).
- Never print or commit secret values, including `.env` and tokens. Refer to
  secrets by name.
- When something fails, find which step it belongs to (tools, sign-in,
  secrets, access) before changing code. On a fresh clone, the code is
  usually fine and the environment isn't.
