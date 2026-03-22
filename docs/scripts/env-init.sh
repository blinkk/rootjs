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

echo ".env file not found, downloading from Google Secrets Manager..."
ENV_CONTENT="$(gcloud secrets versions access latest --secret="$SECRET_NAME" --project="$PROJECT")" || {
  echo "ERROR: Failed to download .env from Google Secrets Manager." >&2
  echo "Ensure gcloud is installed, you are authenticated, and have access to project '$PROJECT'." >&2
  exit 1
}
if [[ -z "$ENV_CONTENT" ]]; then
  echo "ERROR: Secret '$SECRET_NAME' returned empty content." >&2
  exit 1
fi
echo "$ENV_CONTENT" > "$ENV_FILE"
echo "Downloaded .env file."
