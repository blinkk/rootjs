#!/bin/sh

set -e

cmsdev() {
  pnpm --filter="@blinkk/root-cms" run dev
}

docsdev() {
  pnpm --filter="@private/docs" run dev
}

# Start the CMS dev watcher, wait 2s, then start the docs Root server.
cmsdev & sleep 2; docsdev
