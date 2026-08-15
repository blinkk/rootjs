#!/usr/bin/env bash
#
# Container entrypoint. Installs the mounted project's dependencies when they
# are missing, reports whether Google Cloud credentials are available, then
# execs the requested command.

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

if ! is_setup_command "${1:-}"; then
  check_credentials
  maybe_install_deps
fi

exec "$@"
