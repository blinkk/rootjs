#!/bin/sh
#
# Deploys the Google Cloud Images microservice to Google App Engine.
#
# USAGE:
#   ./deploy.sh [options]
#
# OPTIONS:
#   --project      The GCP project (default: rootjs-gci)
#
# EXAMPLES:
#   ./deploy.sh
#   ./deploy.sh --project my-custom-project

set -e

PROJECT="rootjs-gci"

while [[ $# -gt 0 ]]; do
  case $1 in
    --project)
      PROJECT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option $1"
      exit 1
      ;;
  esac
done

gcloud app deploy --project="$PROJECT" --version=prod --promote -q app.yaml

echo "Deployment complete!"
echo ""
echo "Usage requirements:"
echo "1. Ensure the access control policy of any bucket used with the Images API is set to fine-grained: https://cloud.google.com/appengine/docs/standard/services/images"
echo "2. Ensure the app's service account has the 'Storage Admin' role on the bucket. The service account is: ${PROJECT}@appspot.gserviceaccount.com"
