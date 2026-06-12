---
'@blinkk/root': patch
---

fix: prevent worker thread OOM crashes in `root build --threads`

Worker threads now inherit the main thread's heap size limit (e.g. from
`--max-old-space-size`) via `resourceLimits`, instead of falling back to v8's
default sizing, which can collapse to a few hundred MB when many workers spawn
concurrently. Additionally, `--threads=auto` now caps the worker count based
on available memory (budgeting 1GB per worker) in addition to CPU cores and
page count, preventing high-core machines from spawning more workers than the
machine's RAM supports.
