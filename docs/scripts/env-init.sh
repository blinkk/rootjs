#!/bin/bash
# Downloads the .env file from Google Secrets Manager if it doesn't exist locally.
# Used as a predev hook.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCS_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$DOCS_DIR/.env"
PROJECT="rootjs-dev"
SECRET_NAME="docs-env"

if [[ -f "$ENV_FILE" ]]; then
  exit 0
fi

echo ".env file not found, downloading from Google Secrets Manager..."
gcloud secrets versions access latest --secret="$SECRET_NAME" --project="$PROJECT" > "$ENV_FILE"
echo "Downloaded .env file."
