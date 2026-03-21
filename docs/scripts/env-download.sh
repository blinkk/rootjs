#!/bin/bash
# Downloads the .env file from Google Secrets Manager.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCS_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$DOCS_DIR/.env"
PROJECT="rootjs-dev"
SECRET_NAME="docs-env"

if [[ -f "$ENV_FILE" ]]; then
  echo ".env file already exists at $ENV_FILE"
  read -rp "Overwrite? [y/N] " confirm
  if [[ "$confirm" != [yY] ]]; then
    echo "Aborted."
    exit 0
  fi
fi

echo "Downloading .env from secret '$SECRET_NAME'..."
gcloud secrets versions access latest --secret="$SECRET_NAME" --project="$PROJECT" > "$ENV_FILE"
echo "Done. Saved to $ENV_FILE"
