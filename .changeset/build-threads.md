---
'@blinkk/root': minor
---

feat: parallel SSG rendering with `root build --threads`

`root build` now accepts a `--threads [num]` flag that renders SSG pages
using N worker threads. Page rendering was previously limited to a single
CPU core — the `-c/--concurrency` flag overlaps async I/O (e.g. CMS fetches
in `getStaticProps()`) but JSX rendering itself is synchronous CPU work, so
builds for large sites (hundreds of pages across many locales) were
bottlenecked on one core.

Each worker thread loads the site's built server bundle
(`dist/server/render.js`) plus the asset manifest and renders pages
independently, mirroring how the prod server bootstraps. The main thread
computes the sitemap, schedules pages across workers, and aggregates
results (output logging and sitemap.xml generation are unchanged).

Usage:

```sh
# Render pages using 8 worker threads.
root build --threads 8

# Pick a worker count automatically based on cpu cores and page count.
root build --threads
root build --threads auto
```

In auto mode, one core is reserved for the main thread and each worker must
have enough pages to justify its startup cost; small builds automatically
stay in-process.

The flag is opt-in; builds without `--threads` behave exactly as before.
`-c/--concurrency` is distributed across workers (e.g. `-c 30 --threads 6`
gives each worker an async concurrency of 5). Output is byte-for-byte
identical to single-threaded builds.
