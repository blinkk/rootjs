# Root.js Security & Performance Audit

## Summary

This audit covers the Root.js monorepo including `@blinkk/root` (core framework),
`@blinkk/root-cms` (CMS system), `@blinkk/root-password-protect` (auth plugin),
and `@blinkk/rds` (design system). Findings are ranked by severity.

---

## Security Findings

### S1. CRITICAL: Authentication Bypass — Missing `return` After 401 Response

**Files:**
- `packages/root-cms/core/api.ts:299-301` — `/cms/api/data.sync`
- `packages/root-cms/core/api.ts:331-333` — `/cms/api/actions.log`

**Description:**
Two API endpoints send a 401 response when `req.user?.email` is missing but do
**not** `return` afterward. Execution continues into the authenticated code path,
allowing unauthenticated users to trigger data syncs and log arbitrary actions.

```typescript
// BUG: missing "return" — execution falls through to authenticated code
if (!req.user?.email) {
  res.status(401).json({success: false, error: 'UNAUTHORIZED'});
}
// Code continues executing here even without auth...
```

For comparison, the `ai.chat` endpoint at line 371-374 correctly includes `return`:
```typescript
if (!req.user?.email) {
  res.status(401).json({success: false, error: 'UNAUTHORIZED'});
  return;  // Correct
}
```

**Impact:** An unauthenticated attacker can:
- Trigger arbitrary data source syncs via `/cms/api/data.sync` (SSRF-adjacent: the
  sync fetches external URLs configured in data sources)
- Log arbitrary actions to Firestore via `/cms/api/actions.log`, polluting audit logs

**Fix:** Add `return` after each 401 response on lines 300 and 332.

Additionally, the `/cms/api/actions.log` handler is also missing a `return` after the
validation check for missing `action` field (lines 337-343), allowing requests with
no action field to proceed to `cmsClient.logAction()`.

---

### S2. HIGH: Unauthenticated Cron Endpoint

**File:** `packages/root-cms/core/plugin.ts:383-387` and `packages/root-cms/core/api.ts:201-209`

**Description:**
The `/cms/api/cron.run` endpoint explicitly bypasses authentication:
```typescript
if (urlPath === '/cms/api/cron.run') {
  return false; // loginRequired returns false
}
```

The endpoint runs `runCronJobs(req.rootConfig!)` with no auth check, no rate
limiting, and no verification of the caller's identity (e.g., no
`X-Appengine-Cron` header check).

**Impact:** Anyone who can reach the server can trigger cron jobs (version history
saves) at will, potentially causing excessive Firestore writes and increased costs.

**Recommendation:** Validate a shared secret header, or check for
`X-Appengine-Cron: true` / `X-CloudScheduler` headers to restrict to legitimate
cron callers.

---

### S3. HIGH: Unsanitized HTML in Rich Text Rendering

**File:** `packages/root-cms/core/richtext.tsx:81,110,125,214`

**Description:**
The `RichText` component family renders CMS content directly via
`dangerouslySetInnerHTML` without sanitization:

```typescript
// richtext.tsx:81
return <p dangerouslySetInnerHTML={{__html: t(props.data.text)}} />;

// richtext.tsx:214 — Renders arbitrary raw HTML block
return <div dangerouslySetInnerHTML={{__html: html}} />;
```

While this data originates from CMS editors (authenticated users), a compromised
CMS account or a stored XSS payload in Firestore would propagate to all end users
visiting the rendered pages.

**Impact:** Stored XSS. A malicious CMS editor could inject scripts that execute
in the context of every visitor's browser.

**Recommendation:** Sanitize HTML through a library like DOMPurify or
`sanitize-html` before rendering. At minimum, sanitize the `RichText.HtmlBlock`
component which accepts arbitrary raw HTML.

---

### S4. HIGH: SSRF via HTTP Data Sources

**File:** `packages/root-cms/core/client.ts:1424-1446`

**Description:**
The `fetchHttpData()` method fetches URLs from CMS-configured data sources with
minimal validation:
```typescript
const url = dataSource.url || '';
if (!url.startsWith('https://')) {
  throw new Error(`url not supported: ${url}`);
}
const res = await fetch(url, {
  method: dataSource.httpOptions?.method || 'GET',
  headers: dataSource.httpOptions?.headers || [],
  body: dataSource.httpOptions?.body || undefined,
});
```

The `https://` prefix check is trivially bypassed (e.g., `https://169.254.169.254`
for cloud metadata services, `https://internal-service.local`). The method, headers,
and body are all configurable.

**Impact:** A CMS admin could configure a data source pointing to internal cloud
metadata endpoints or internal services, exfiltrating credentials or sensitive data.

**Recommendation:** Implement a URL allowlist or blocklist for internal IP ranges
(RFC 1918, link-local, cloud metadata IPs). Consider DNS resolution validation to
prevent DNS rebinding.

---

### S5. MEDIUM: Weak Content Security Policy

**Files:**
- `packages/root-password-protect/src/core/csp.ts:21`
- `packages/root/src/render/render.tsx` (CSP header generation)

**Description:**
The CSP includes `'unsafe-eval'` and `'unsafe-inline'` alongside nonce-based
enforcement:
```
script-src 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval' 'strict-dynamic' https: http:
```

`'unsafe-eval'` allows `eval()`, `new Function()`, and `setTimeout("string")`,
undermining XSS protection. Note: the `'unsafe-inline'` is technically ignored in
browsers that support `'nonce-...'` due to `'strict-dynamic'`, but `'unsafe-eval'`
remains active.

Additionally, the CSP is set as `content-security-policy-report-only` (line 23),
meaning violations are only reported, not blocked.

**Recommendation:**
1. Remove `'unsafe-eval'` if not strictly required
2. Switch from `report-only` to enforcement mode (`content-security-policy`)

---

### S6. MEDIUM: Command Injection Surface in GAE Deployment

**File:** `packages/root/src/cli/gae-deploy.ts:79-82,111-114,143-146`

**Description:**
The deployment script uses `execSync()` with string interpolation:
```typescript
execSync(`gcloud app deploy -q --project=${project} --version=${version} ...`);
execSync(`gcloud app versions delete -q --project=${project} --service=${service} ${eachVersion.id}`);
```

While `project`, `version`, and `service` are derived from internal config, the
`eachVersion.id` comes from parsing `gcloud` JSON output. A compromised or
malicious gcloud response could inject shell commands.

**Recommendation:** Use `execFileSync('gcloud', ['app', 'deploy', ...])` with
argument arrays instead of string interpolation to prevent shell injection.

---

### S7. MEDIUM: XSS via `window.__ROOT_CTX` Injection

**File:** `packages/root-cms/core/app.tsx:66`

**Description:**
```typescript
<script dangerouslySetInnerHTML={{
  __html: `window.__ROOT_CTX = ${JSON.stringify(props.ctx)}`
}} nonce="{NONCE}" />
```

If `props.ctx` contains user-controlled values with `</script>` sequences, they
would break out of the script tag. `JSON.stringify` does not escape `</script>` or
`<!--` sequences.

**Recommendation:** Use a safe serialization function that escapes HTML-special
sequences within JSON (e.g., replace `<` with `\u003c`, `>` with `\u003e`).

---

### S8. LOW: Session Cookie Defaults

**File:** `packages/root/src/middleware/session.ts:49-53`

**Description:**
The session cookie defaults to `SameSite=none` in production, which is the most
permissive setting. While necessary for cross-site CMS embedding, it increases
exposure to CSRF attacks.

```typescript
sameSite = secureCookie ? 'none' : 'strict';
```

**Recommendation:** Default to `SameSite=lax` unless cross-site usage is explicitly
configured. Provide a configuration option for `SameSite` in `RootConfig`.

---

### S9. LOW: JWT Verification Bypassed in Development

**File:** `packages/root-cms/core/plugin.ts:430-436`

**Description:**
In development mode, JWT tokens are decoded but not cryptographically verified:
```typescript
if (process.env.NODE_ENV === 'development') {
  const jwt = jsonwebtoken.decode(idToken) as jsonwebtoken.JwtPayload;
  // Only checks email and email_verified — no signature verification
}
```

This is documented and intentional (avoiding service account setup for local dev),
but if `NODE_ENV` is accidentally set to `development` in a deployed environment,
authentication is effectively disabled.

**Recommendation:** Add a secondary check (e.g., check for a local-only env var or
hostname) to prevent accidental bypass in deployed environments.

---

### S10. LOW: Missing Rate Limiting

No rate limiting middleware was found on any API endpoints. Endpoints like
`/cms/api/ai.chat` (which calls external AI services) and `/cms/api/cron.run` are
particularly sensitive to abuse.

**Recommendation:** Add rate limiting middleware (e.g., `express-rate-limit`) at
minimum on AI and cron endpoints.

---

## Performance Findings

### P1. HIGH: Sequential Async Operations That Should Be Parallel

**File:** `packages/root-cms/cli/export.ts:88-102`

```typescript
for (const collectionType of collectionsToExport) {
  await exportCollection(...); // Sequential — each collection waits for prior
}
```

**Recommendation:** Use `Promise.all()` or a controlled concurrency pool
(`Promise.allSettled` with chunking) to export collections in parallel.

---

### P2. HIGH: Synchronous File I/O Blocking the Event Loop

**Files:**
- `packages/root-cms/core/ai.ts:396` — `fs.readFileSync()`
- `packages/root-cms/cli/docs.ts:63,96,162,204` — `readFileSync`/`writeFileSync`
- `packages/root-cms/cli/export.ts:78,239` — `writeFileSync`
- `packages/root-cms/cli/import.ts:318` — `readFileSync` inside `Promise.all()`

**Description:**
Synchronous file operations block the Node.js event loop. The most problematic is
in `import.ts:318` where `readFileSync` inside a `Promise.all()` map defeats the
purpose of parallel execution — all reads happen synchronously on the same tick.

**Recommendation:** Replace with `fs.promises.readFile`/`writeFile` (already
imported as `fs` in several files via `promises`). For CLI-only code (not
server-side), synchronous I/O is less critical but still causes unnecessary delays
on large datasets.

---

### P3. MEDIUM: TranslationsTable Data Processing

**File:** `packages/root-cms/ui/components/TranslationsTable/TranslationsTable.tsx:196-257`

**Description:**
The `useEffect` that processes `translationsMap` performs multiple nested iterations
(Object.entries → forEach → tag filtering → search filtering → locale forEach) and
rebuilds the entire dataset on every search keystroke (debounced by 300ms).

The `columnDefs` `useMemo` (line 270) creates new anonymous `cellRenderer` functions
on every dependency change, breaking ag-grid's internal memoization.

**Recommendation:**
- Memoize the tag-filtered dataset separately from the search-filtered dataset
- Extract `cellRenderer` to a named component with `React.memo`
- Consider moving filtering to a web worker for very large translation datasets

---

### P4. MEDIUM: Glob Pattern Recompilation

**File:** `packages/root-cms/cli/utils.ts:33-69`

**Description:**
The `checkMatch()` function is called for every file during import/export. Each call
runs `globMatch(path, pattern)` which may recompile the glob pattern to regex.

**Recommendation:** Pre-compile glob patterns to regex once before the loop using
`micromatch.matcher()` or `picomatch()`.

---

### P5. LOW: Array Slice in Batch Loop

**File:** `packages/root-cms/ui/utils/l10n.ts:129-141`

```typescript
for (let i = 0; i < updates.length; i += batchSize) {
  const chunk = updates.slice(i, i + batchSize); // new array each iteration
}
```

**Recommendation:** Use index-based iteration instead of `slice()` for zero
allocation, or accept the minor cost since batch sizes are typically small (500).

---

### P6. LOW: Missing Lazy Loading for Heavy CMS Components

**File:** `packages/root-cms/ui/pages/DocumentPage/DocumentPage.tsx`

**Description:**
Modal components like `EditJsonModal`, `ChecksPanel`, and the rich text editor are
imported eagerly at module level. These are only shown on user interaction.

**Recommendation:** Use `React.lazy()` / dynamic `import()` for modal and editor
components to reduce initial bundle size.

---

## Positive Security Practices Observed

1. **Consistent auth enforcement** — Most CMS API endpoints correctly check
   `req.user?.email` before processing (the missing-return bugs above are exceptions)
2. **Signed cookies** — Session cookies use `signed: true` with HttpOnly and Secure
   flags
3. **Input validation** — `testValidCollectionId()` uses strict regex `^[A-Za-z0-9_-]+$`
4. **Role-based access control** — Firestore security rules enforce granular RBAC
   (Admin/Editor/Contributor/Viewer)
5. **Nonce-based CSP** — Script tags use cryptographic nonces
6. **No hardcoded secrets** — Credentials are loaded from environment variables
7. **Firebase Admin SDK** — Server-side Firestore access uses the admin SDK with
   proper IAM controls

---

## Priority Remediation Order

| Priority | Finding | Effort |
|----------|---------|--------|
| 1 | S1: Auth bypass (missing return) | 5 min |
| 2 | S2: Unauthenticated cron endpoint | 30 min |
| 3 | S3: Unsanitized rich text HTML | 2 hrs |
| 4 | S4: SSRF via data sources | 1 hr |
| 5 | S7: XSS via `__ROOT_CTX` | 30 min |
| 6 | S5: Weak CSP | 1 hr |
| 7 | P1+P2: Async I/O and parallelism | 2 hrs |
| 8 | S6: Command injection in deploy | 1 hr |
