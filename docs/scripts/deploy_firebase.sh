#!/usr/bin/env bash
#
# Runs `firebase <args>` with a few retries.
#
# firebase-tools resolves credentials from GOOGLE_APPLICATION_CREDENTIALS via
# GoogleAuth.getAccessToken(), which performs a network token exchange that
# intermittently fails with "Failed to authenticate, have you run firebase
# login?" (the same commit succeeds on a re-run). Retry a few times to ride out
# those transient failures.
#
# All diagnostics are written to stderr so callers can safely capture the
# command's stdout (e.g. `firebase ... --json`).
#
# Usage:
#   docs/scripts/deploy_firebase.sh deploy --only hosting --project rootjs-dev --force
set -euo pipefail

max_attempts="${FIREBASE_DEPLOY_MAX_ATTEMPTS:-3}"
retry_delay="${FIREBASE_DEPLOY_RETRY_DELAY:-15}"

attempt=1
until pnpm exec firebase "$@"; do
  if [[ "$attempt" -ge "$max_attempts" ]]; then
    echo "firebase $1 failed after ${max_attempts} attempts." >&2
    exit 1
  fi
  echo "firebase $1 attempt ${attempt} failed; retrying in ${retry_delay}s..." >&2
  attempt=$((attempt + 1))
  sleep "$retry_delay"
done
