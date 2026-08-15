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
docker build -t root-cms docker/

# 2. Create the volume that will hold your gcloud credentials.
docker volume create root-cms-gcloud

# 3. Sign in — once. Follow the printed URL, paste the code back in.
#    Replace MY_GCP_PROJECT with your Firebase/GCP project id.
docker run --rm -it \
  -v root-cms-gcloud:/home/rootjs/.config/gcloud \
  root-cms bash -lc '
    gcloud auth login --no-launch-browser &&
    gcloud auth application-default login --no-launch-browser &&
    gcloud config set project MY_GCP_PROJECT &&
    gcloud auth application-default set-quota-project MY_GCP_PROJECT'

# 4. Run the project. Dependencies install automatically on first start.
docker run --rm -it --init \
  -p 4007:4007 \
  -v "$PWD:/workspace" \
  -v root-cms-gcloud:/home/rootjs/.config/gcloud \
  -v root-cms-pnpm-store:/home/rootjs/.pnpm-store \
  --env-file .env \
  root-cms
```

The CMS is then at <http://localhost:4007/cms/>.

Step 3 only has to be repeated when the credentials are revoked or the volume
is deleted. To verify a volume already holds credentials:

```bash
docker run --rm -it \
  -v root-cms-gcloud:/home/rootjs/.config/gcloud \
  root-cms gcloud auth list
```

### Using docker compose instead

`docker-compose.yml` wires up the same volumes declaratively:

```bash
export ROOT_PROJECT_DIR=/path/to/my-project
export GOOGLE_CLOUD_PROJECT=my-gcp-project

docker compose -f docker/docker-compose.yml run --rm root-cms bash -lc '
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
  -v root-cms-gcloud:/home/rootjs/.config/gcloud root-cms bash

# The Root CMS CLI.
docker run --rm -it -v "$PWD:/workspace" \
  -v root-cms-gcloud:/home/rootjs/.config/gcloud \
  root-cms pnpm exec root-cms client.methods --json

# A production build + server.
docker run --rm -it -p 4007:4007 -v "$PWD:/workspace" \
  -v root-cms-gcloud:/home/rootjs/.config/gcloud \
  root-cms bash -lc 'pnpm exec root build && pnpm exec root start --host 0.0.0.0'
```

Dependency installation is controlled by `ROOT_DOCKER_INSTALL`: `auto` (the
default — install only when `node_modules` is missing), `always`, or `never`.

## Other ways to supply credentials

**Reuse the host's gcloud config.** If you're already signed in on the host,
bind-mount the config directory instead of using a named volume. Ownership has
to line up, so build with your own uid/gid if it isn't `1000`:

```bash
docker build -t root-cms --build-arg UID="$(id -u)" --build-arg GID="$(id -g)" docker/
docker run --rm -it -p 4007:4007 \
  -v "$PWD:/workspace" \
  -v "$HOME/.config/gcloud:/home/rootjs/.config/gcloud" \
  root-cms
```

**Service account key**, for CI or a shared server:

```bash
docker run --rm -it -p 4007:4007 \
  -v "$PWD:/workspace" \
  -v /path/to/key.json:/secrets/key.json:ro \
  -e GOOGLE_APPLICATION_CREDENTIALS=/secrets/key.json \
  root-cms
```

**Workload identity / metadata server.** On GCE, Cloud Run, or GKE, ADC is
picked up from the metadata server automatically — no volume needed.

## Project env vars

Google Cloud credentials only cover the server side. The CMS sign-in page uses
Firebase Auth in the browser, which needs the `firebaseConfig` and `gapi` keys
that `root.config.ts` reads from the environment (`GAPI_API_KEY`,
`GAPI_CLIENT_ID`, `COOKIE_SECRET`, and any translation/AI provider keys). Pass
them with `--env-file .env` or compose's `env_file`.

## Baking a project into an image

For a deployable image, use this one as a base:

```dockerfile
FROM root-cms

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

[adc]: https://cloud.google.com/docs/authentication/application-default-credentials
