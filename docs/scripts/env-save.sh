#!/bin/bash
# Saves the local .env file to Google Secrets Manager.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCS_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$DOCS_DIR/.env"
PROJECT="rootjs-dev"
SECRET_NAME="docs-env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env file not found at $ENV_FILE"
  exit 1
fi

# Create the secret if it doesn't exist yet.
if ! gcloud secrets describe "$SECRET_NAME" --project="$PROJECT" &>/dev/null; then
  echo "Creating secret '$SECRET_NAME' in project '$PROJECT'..."
  gcloud secrets create "$SECRET_NAME" --project="$PROJECT" --replication-policy="automatic"
fi

echo "Saving .env to secret '$SECRET_NAME'..."
gcloud secrets versions add "$SECRET_NAME" --project="$PROJECT" --data-file="$ENV_FILE"
echo "Done."
