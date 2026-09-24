#!/usr/bin/env bash
#
# Container entrypoint. Sets up the git committer identity and push credentials,
# installs the mounted project's dependencies when they are missing, reports
# whether Google Cloud credentials are available, then execs the requested
# command.

set -euo pipefail

readonly ADC_FILE="${HOME}/.config/gcloud/application_default_credentials.json"

# Returns 0 for commands that exist to create credentials or poke at the
# container (`gcloud auth login`, an interactive shell), which shouldn't be
# gated on credentials already existing.
is_setup_command() {
  case "${1:-}" in
    gcloud | bash | sh | zsh) return 0 ;;
    *) return 1 ;;
  esac
}

# Warns when Root CMS won't be able to reach Firestore. This never fails the
# container: some commands (`root build --ssr-only`, `pnpm lint`) don't need
# credentials at all.
check_credentials() {
  if [[ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]]; then
    if [[ ! -f "${GOOGLE_APPLICATION_CREDENTIALS}" ]]; then
      echo "[root docker] GOOGLE_APPLICATION_CREDENTIALS is set to" \
        "'${GOOGLE_APPLICATION_CREDENTIALS}' but no file exists there." >&2
    fi
    return 0
  fi

  if [[ -f "${ADC_FILE}" ]]; then
    return 0
  fi

  cat >&2 <<EOF
[root docker] No application default credentials (ADC) found at
${ADC_FILE}

Root CMS reads and writes Firestore using ADC, so those requests will fail
until you sign in. Run this once, with the same gcloud volume mounted:

  docker run --rm -it \\
    -v root-gcloud:${HOME}/.config/gcloud \\
    root gcloud auth application-default login --no-launch-browser

EOF
}

# Git refuses to commit without a committer identity, and an exported-but-empty
# GIT_* variable fails harder than an unset one ("empty ident name not allowed"),
# so drop the empties. GIT_AUTHOR_* is mirrored to GIT_COMMITTER_* so callers
# only have to pass one pair.
export_git_identity() {
  local name
  for name in GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL; do
    if [[ -z "${!name:-}" ]]; then
      unset "${name}"
    fi
  done
  if [[ -n "${GIT_AUTHOR_NAME:-}" ]] && [[ -z "${GIT_COMMITTER_NAME:-}" ]]; then
    export GIT_COMMITTER_NAME="${GIT_AUTHOR_NAME}"
  fi
  if [[ -n "${GIT_AUTHOR_EMAIL:-}" ]] && [[ -z "${GIT_COMMITTER_EMAIL:-}" ]]; then
    export GIT_COMMITTER_EMAIL="${GIT_AUTHOR_EMAIL}"
  fi
}

# Warns when a commit would fail for lack of an identity. Only meaningful inside
# a repository, so non-git workspaces stay quiet.
warn_missing_git_identity() {
  if [[ -n "${GIT_AUTHOR_EMAIL:-}" ]]; then
    return 0
  fi
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return 0
  fi
  if [[ -n "$(git config --get user.email 2>/dev/null || true)" ]]; then
    return 0
  fi
  echo "[root docker] No git identity configured — commits will fail. Pass" \
    "-e GIT_AUTHOR_NAME -e GIT_AUTHOR_EMAIL, or mount a gitconfig at" \
    "${HOME}/.gitconfig." >&2
}

# Points git at `gh` for credentials, so `git push` and `gh pr create` work with
# a token from the environment (GH_TOKEN / GITHUB_TOKEN) or with a `gh auth
# login` persisted in a volume at ~/.config/gh. A no-op when gh isn't installed
# (the base image) or when there is nothing to authenticate with.
#
# The config is written to the container's own ~/.gitconfig, which lives in the
# writable layer, so nothing is left behind on the host and no token is
# persisted to a volume.
configure_git_credentials() {
  local name
  for name in GH_TOKEN GITHUB_TOKEN GH_HOST; do
    if [[ -z "${!name:-}" ]]; then
      unset "${name}"
    fi
  done

  command -v gh >/dev/null 2>&1 || return 0

  local host="${GH_HOST:-github.com}"
  local token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
  # Checking the config file rather than `gh auth status` keeps startup offline
  # and fast — `gh auth status` validates the token over the network.
  local gh_hosts="${GH_CONFIG_DIR:-${HOME}/.config/gh}/hosts.yml"
  if [[ -z "${token}" ]] && [[ ! -s "${gh_hosts}" ]]; then
    return 0
  fi

  # `gh auth setup-git` is the supported path, but some versions refuse when the
  # only credential is an environment token. The helper it would have written
  # works either way, so fall back to writing it directly.
  if ! gh auth setup-git --hostname "${host}" >/dev/null 2>&1; then
    if ! git config --global "credential.https://${host}.helper" '!gh auth git-credential'; then
      echo "[root docker] Could not configure the git credential helper —" \
        "${HOME}/.gitconfig is not writable. Pushing will fail." >&2
      return 0
    fi
  fi

  # A token only authenticates https remotes, so rewrite ssh remotes. Without
  # this, a repository cloned over ssh still fails to push with no key present.
  if [[ -n "${token}" ]]; then
    git config --global "url.https://${host}/.insteadOf" "git@${host}:" || true
  fi
}

# Installs dependencies when /workspace looks like an uninstalled npm project.
# Set ROOT_DOCKER_INSTALL=always to reinstall on every start, or =never to skip.
maybe_install_deps() {
  local mode="${ROOT_DOCKER_INSTALL:-auto}"
  if [[ "${mode}" == 'never' ]] || [[ ! -f package.json ]]; then
    return 0
  fi
  if [[ "${mode}" == 'auto' ]] && [[ -d node_modules ]]; then
    return 0
  fi
  echo '[root docker] Installing dependencies with pnpm...' >&2
  pnpm install
}

export_git_identity
configure_git_credentials

if ! is_setup_command "${1:-}"; then
  check_credentials
  warn_missing_git_identity
  maybe_install_deps
fi

exec "$@"
