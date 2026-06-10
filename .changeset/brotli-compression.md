---
'@blinkk/root': patch
---

feat: brotli compression for prod/preview server responses

Upgrades `compression` to 1.8.1 and configures the prod (`root start`) and
preview (`root preview`) servers to serve brotli-encoded responses when the
client sends `Accept-Encoding: br`, falling back to gzip as before.

Previously, `compression@1.7.4` did not understand brotli at all — clients
that advertised only `br` received entirely uncompressed responses.

Brotli quality is set to 4, the standard setting for on-the-fly compression
of dynamic responses. In an end-to-end test against `root start` with a
3.8 MB rendered page, brotli q4 produced a 63% smaller payload than gzip
(27.6 kB vs 74 kB) at lower CPU cost (~6ms vs ~12ms total response time).
Note that brotli's library default (q11) is intentionally avoided — it is
~10-50x more expensive and only appropriate for compress-once static assets.
