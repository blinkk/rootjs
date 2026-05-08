#!/bin/bash
# Downloads the .env file from Google Secrets Manager if it doesn't exist locally.
# Used as a predev hook.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCS_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$DOCS_DIR/.env"
PROJECT="rootjs-dev"
SECRET_NAME="docs-env"

if [[ -s "$ENV_FILE" ]]; then
  exit 0
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "Error: gcloud is not installed or is not on PATH." >&2
  exit 1
fi

TMP_FILE="$(mktemp "${ENV_FILE}.tmp.XXXXXX")"
trap 'rm -f "$TMP_FILE"' EXIT

if [[ -f "$ENV_FILE" ]]; then
  echo ".env file exists but is empty, re-downloading from Google Secrets Manager..."
else
  echo ".env file not found, downloading from Google Secrets Manager..."
fi

if ! gcloud secrets versions access latest --secret="$SECRET_NAME" --project="$PROJECT" > "$TMP_FILE"; then
  echo "Error: failed to download .env from secret '$SECRET_NAME' in project '$PROJECT'." >&2
  exit 1
fi

if [[ ! -s "$TMP_FILE" ]]; then
  echo "Error: downloaded .env from secret '$SECRET_NAME' was empty." >&2
  exit 1
fi

mv "$TMP_FILE" "$ENV_FILE"
trap - EXIT
echo "Downloaded .env file."
