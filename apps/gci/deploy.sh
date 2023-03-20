#!/bin/sh

set -e

gcloud app deploy --project=rootjs-gci --version=prod --promote app.yaml
