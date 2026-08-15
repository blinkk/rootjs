# Docker image for Root.js CMS projects

An Ubuntu 24.04 image with everything needed to run a Root.js CMS project
against a real Firebase/Firestore project:

| Tool             | Version                                            |
| ---------------- | -------------------------------------------------- |
| Node.js          | `24.16.0` (`NODE_VERSION` build arg)               |
| pnpm             | `11.17.0` via corepack (`PNPM_VERSION` build arg)  |
| Google Cloud CLI | latest from the `cloud-sdk` apt repo               |

The project is **not** baked into the image — you mount it at `/workspace`. The
container runs as a non-root user (uid/gid `1000` by default) so files it
writes into the mounted project stay owned by you.

`Dockerfile.claude` builds on top of it to add the Claude Code CLI — see
[Running Claude Code against the project](#running-claude-code-against-the-project).

## How auth works

Root CMS connects to Firestore with the Firebase Admin SDK, which uses
[Application Default Credentials][adc] (see
`packages/root-cms/core/plugin.ts`). Some CLI features (`root secrets`) also
shell out to `gcloud` directly, so the container needs both:

- `gcloud auth login` — credentials for the `gcloud` CLI itself.
- `gcloud auth application-default login` — the ADC file that
  `firebase-admin` reads.

Both are written to `$HOME/.config/gcloud` inside the container
(`/home/rootjs/.config/gcloud`). Mount a named volume there and you sign in
**once**; every later `docker run` reuses it.

## Quick start

```bash
# 1. Build the image.
docker build -t root docker/

# 2. Create the volume that will hold your gcloud credentials.
docker volume create root-gcloud

# 3. Sign in — once. Follow the printed URL, paste the code back in.
#    Replace MY_GCP_PROJECT with your Firebase/GCP project id.
docker run --rm -it \
  -v root-gcloud:/home/rootjs/.config/gcloud \
  root bash -lc '
    gcloud auth login --no-launch-browser &&
    gcloud auth application-default login --no-launch-browser &&
    gcloud config set project MY_GCP_PROJECT &&
    gcloud auth application-default set-quota-project MY_GCP_PROJECT'

# 4. Run the project. Dependencies install automatically on first start.
docker run --rm -it --init \
  -p 4007:4007 \
  -v "$PWD:/workspace" \
  -v root-gcloud:/home/rootjs/.config/gcloud \
  -v root-pnpm-store:/home/rootjs/.pnpm-store \
  --env-file .env \
  root
```

The CMS is then at <http://localhost:4007/cms/>.

Step 3 only has to be repeated when the credentials are revoked or the volume
is deleted. To verify a volume already holds credentials:

```bash
docker run --rm -it \
  -v root-gcloud:/home/rootjs/.config/gcloud \
  root gcloud auth list
```

### Using docker compose instead

`docker-compose.yml` wires up the same volumes declaratively:

```bash
export ROOT_PROJECT_DIR=/path/to/my-project
export GOOGLE_CLOUD_PROJECT=my-gcp-project

docker compose -f docker/docker-compose.yml run --rm root bash -lc '
  gcloud auth login --no-launch-browser &&
  gcloud auth application-default login --no-launch-browser &&
  gcloud auth application-default set-quota-project $CLOUDSDK_CORE_PROJECT'

docker compose -f docker/docker-compose.yml up
```

`ROOT_PROJECT_DIR` defaults to this repo's root, and `ROOT_PROJECT_SUBDIR`
picks a project inside it — e.g. `ROOT_PROJECT_SUBDIR=docs` to run the docs
site from a checkout of this monorepo. `${ROOT_PROJECT_DIR}/.env` is loaded
automatically when present. The shell doesn't export `UID`/`GID`, so pass them
explicitly if your host user isn't `1000`:

```bash
UID=$(id -u) GID=$(id -g) docker compose -f docker/docker-compose.yml build
```

## Running commands other than the dev server

The default command is `root dev --host 0.0.0.0`. Anything else can be passed
as the `docker run` command:

```bash
# A shell.
docker run --rm -it -v "$PWD:/workspace" \
  -v root-gcloud:/home/rootjs/.config/gcloud root bash

# The Root CMS CLI.
docker run --rm -it -v "$PWD:/workspace" \
  -v root-gcloud:/home/rootjs/.config/gcloud \
  root pnpm exec root-cms client.methods --json

# A production build + server.
docker run --rm -it -p 4007:4007 -v "$PWD:/workspace" \
  -v root-gcloud:/home/rootjs/.config/gcloud \
  root bash -lc 'pnpm exec root build && pnpm exec root start --host 0.0.0.0'
```

Dependency installation is controlled by `ROOT_DOCKER_INSTALL`: `auto` (the
default — install only when `node_modules` is missing), `always`, or `never`.

## Other ways to supply credentials

**Reuse the host's gcloud config.** If you're already signed in on the host,
bind-mount the config directory instead of using a named volume. Ownership has
to line up, so build with your own uid/gid if it isn't `1000`:

```bash
docker build -t root --build-arg UID="$(id -u)" --build-arg GID="$(id -g)" docker/
docker run --rm -it -p 4007:4007 \
  -v "$PWD:/workspace" \
  -v "$HOME/.config/gcloud:/home/rootjs/.config/gcloud" \
  root
```

**Service account key**, for CI or a shared server:

```bash
docker run --rm -it -p 4007:4007 \
  -v "$PWD:/workspace" \
  -v /path/to/key.json:/secrets/key.json:ro \
  -e GOOGLE_APPLICATION_CREDENTIALS=/secrets/key.json \
  root
```

**Workload identity / metadata server.** On GCE, Cloud Run, or GKE, ADC is
picked up from the metadata server automatically — no volume needed.

## Project env vars

Google Cloud credentials only cover the server side. The CMS sign-in page uses
Firebase Auth in the browser, which needs the `firebaseConfig` and `gapi` keys
that `root.config.ts` reads from the environment (`GAPI_API_KEY`,
`GAPI_CLIENT_ID`, `COOKIE_SECRET`, and any translation/AI provider keys). Pass
them with `--env-file .env` or compose's `env_file`.

## Running Claude Code against the project

`Dockerfile.claude` builds a child image (`FROM root`) that adds the Claude
Code CLI, so an agent session runs with the same Node, pnpm, gcloud and project
files as the dev server. Its default command is `claude remote-control`, which
[drives the session from claude.ai or the Claude app][remote-control] while
execution stays in the container.

It's deliberately a separate image rather than a flag on the base one: the base
image is also the base for deployable images (see below), and the agent image
carries a second credential surface — a claude.ai token — on top of the
project's Google Cloud credentials.

```bash
# 1. Build the base image first, then the child.
docker build -t root docker/
docker build -t root-ai-claude -f docker/Dockerfile.claude docker/

docker volume create root-ai-claude-config

# 2. Sign in and accept the workspace trust prompt. Remote Control needs a
#    claude.ai login (Pro, Max, Team or Enterprise) — API keys don't work.
#    If the browser callback can't reach the container, paste the code shown in
#    the browser at the "Paste code here if prompted" prompt.
docker run --rm -it \
  -v "$PWD:/workspace" \
  -v root-ai-claude-config:/home/rootjs/.claude \
  root-ai-claude claude

# 3. Start Remote Control. It prints a session URL; press space for a QR code.
docker run --rm -it --init \
  -p 4008:4007 \
  -v "$PWD:/workspace" \
  -v root-ai-claude-config:/home/rootjs/.claude \
  -v root-gcloud:/home/rootjs/.config/gcloud \
  -v root-pnpm-store:/home/rootjs/.pnpm-store \
  --env-file .env \
  root-ai-claude
```

Or with compose, where the service sits behind a `claude` profile so
`docker compose up` never starts an agent by surprise:

```bash
docker compose -f docker/docker-compose.yml build root
docker compose -f docker/docker-compose.yml build claude
docker compose -f docker/docker-compose.yml run --rm claude
```

Port 4008 maps to the container's 4007, so a dev server Claude starts inside the
container is at <http://localhost:4008/cms/> — on a different host port than the
`root` service, so both can run at once.

Other useful commands: `claude` for a plain local session, `claude
--remote-control` for one that is both local and remote, and `claude
remote-control --spawn worktree` to give each remote session its own git
worktree.

### Notes

- **Credentials the agent inherits.** Mounting the gcloud volume gives Claude
  write access to your CMS's Firestore data. For anything beyond a scratch
  project, point the agent container at a volume signed in to a non-production
  project, or leave the gcloud mount off entirely and let it work on code only.
  This is also why `--dangerously-skip-permissions` deserves care here, even
  though the container runs as a non-root user (the CLI rejects that flag as
  root).
- **Don't disable non-essential traffic.** `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`,
  `DISABLE_TELEMETRY`, `DO_NOT_TRACK` and `DISABLE_GROWTHBOOK` each turn off the
  feature-flag lookup Remote Control depends on. Likewise, Remote Control is
  disabled when `ANTHROPIC_BASE_URL` points anywhere other than
  `api.anthropic.com` — worth knowing if your project's `.env` sets it.
- **The session lives as long as the container.** Remote Control is a local
  process; stopping the container takes the session offline. Re-running
  `claude remote-control` in the same directory brings its sessions back for
  about four hours.
- **Updates.** Claude Code self-updates into the container's writable layer, so
  a `--rm` run starts from the version baked into the image. Rebuild
  periodically (`docker build --no-cache -f docker/Dockerfile.claude ...`), or
  pin with `--build-arg CLAUDE_CODE_VERSION=X.Y.Z` plus
  `-e DISABLE_AUTOUPDATER=1`.

## Baking a project into an image

For a deployable image, use this one as a base:

```dockerfile
FROM root

COPY --chown=1000:1000 . /workspace
RUN pnpm install --frozen-lockfile && pnpm exec root build

ENV ROOT_DOCKER_INSTALL=never
CMD ["pnpm", "exec", "root", "start", "--host", "0.0.0.0"]
```

Don't bake credentials in — supply them at runtime with one of the options
above.

## Troubleshooting

- **`Could not load the default credentials`** — the gcloud volume isn't
  mounted, or is mounted at the wrong path. It must be
  `/home/rootjs/.config/gcloud` (or `/home/<USERNAME>/...` if you overrode the
  `USERNAME` build arg).
- **`Your application is authenticating by using local Application Default
  Credentials... quota project`** — run `gcloud auth application-default
  set-quota-project MY_GCP_PROJECT`.
- **`reauthentication is needed`** — user ADC expires. Re-run
  `gcloud auth application-default login` with the volume mounted.
- **Permission errors on files in the mounted project** — rebuild with
  `--build-arg UID="$(id -u)" --build-arg GID="$(id -g)"`.
- **Port already in use** — `root dev` reads `PORT` (default `4007`), so
  `-e PORT=5000 -p 5000:5000` moves it.

- **`claude remote-control` exits immediately** — it checks eligibility before
  anything else. Run `claude` in the container and use `/login`; the volume at
  `/home/rootjs/.claude` has to be mounted for that login to stick.

[adc]: https://cloud.google.com/docs/authentication/application-default-credentials
[remote-control]: https://code.claude.com/docs/en/remote-control
