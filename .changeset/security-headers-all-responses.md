---
'@blinkk/root': patch
---

fix: set security headers (e.g. HSTS) on all server responses

Security headers from the `server.security` config were previously only set on
rendered HTML responses. Responses that bypass the renderer — redirects
(`server.redirects`, trailing slash), static files, plugin-served responses,
and 404s — were served without them. HSTS preload eligibility
(https://hstspreload.org) requires the `Strict-Transport-Security` header on
redirects as well.

A new `securityHeadersMiddleware` now sets `Strict-Transport-Security`,
`X-Content-Type-Options`, `X-Frame-Options`, and `X-XSS-Protection` on every
response served by the dev, preview, and prod servers, respecting the existing
`server.security` config options. `Content-Security-Policy` is unchanged and
still set at render time (it depends on a per-request nonce).
