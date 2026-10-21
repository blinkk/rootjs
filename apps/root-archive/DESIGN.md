# Root Archive — Technical Design Doc

> Status: **Draft / RFC**
> Author: stevenle08@gmail.com
> Last updated: 2026-06-25

## 1. Summary

Root Archive is a new app in the monorepo (`apps/root-archive`) that captures and
stores screenshots of public websites over time, in the spirit of the Internet
Archive's Wayback Machine. A user supplies one or more public URLs (or a link to a
`sitemap.xml`), and the system launches headless Chrome, screenshots each page, and
stores the images plus metadata so they can be browsed by URL and capture time.

The system runs entirely on Google Cloud Platform and reuses primitives already
standard in this repo: **Firestore** for metadata (as `root-cms` does) and **Google
Cloud Storage** for binary blobs (as `apps/root-services` does for images).

## 2. Goals & Non-Goals

### Goals

- Accept one or more public URLs, or a `sitemap.xml` URL that expands to many URLs.
- Render each URL in headless Chrome and capture a screenshot (full-page by default).
- Store screenshots durably and record metadata (URL, timestamp, viewport, status,
  page hash, etc.).
- Support **recurring** captures on a schedule so a URL accumulates a history of
  snapshots over time (the "Wayback" behavior).
- Provide an API and a minimal viewer UI to browse captures by URL and time.
- Run on GCP, horizontally scalable, with sensible cost controls and rate limiting.

### Non-Goals (v1)

- Full HTML/asset replay (i.e. reconstructing a live, clickable page like Wayback's
  WARC replay). v1 stores **images** (and optionally a static DOM/MHTML dump), not a
  navigable mirror.
- Crawling/spidering by following on-page links. v1 only expands explicit URL lists
  and sitemaps. Recursive crawling is a future extension.
- Authenticated or paywalled pages. v1 targets public URLs only.
- Per-tenant billing/quotas beyond basic rate limiting (multi-tenancy is a future
  concern; the data model leaves room for it).

## 3. Key Concepts / Domain Model

| Term | Meaning |
| --- | --- |
| **Target** | A website the user wants to archive. Identified by a normalized origin (e.g. `https://example.com`). |
| **Capture Job** | A single requested run: "screenshot these URLs (or this sitemap) now". Fans out into many page captures. |
| **Page Capture** | One screenshot of one URL at one point in time. The atomic unit of storage. |
| **Schedule** | An optional recurrence (e.g. daily) attached to a Target that creates Capture Jobs automatically. |

## 4. High-Level Architecture

```
                         ┌──────────────────────────────────────────────┐
                         │                  Clients                       │
                         │   Viewer UI (Root.js)   •   REST/JSON API      │
                         └───────────────┬───────────────┬───────────────┘
                                         │               │
                                         ▼               ▼
                            ┌──────────────────────────────────┐
                            │   API / Control Plane             │  Cloud Run (Node + TS)
                            │   - create/list jobs & captures   │
                            │   - validate + normalize URLs     │
                            │   - manage schedules              │
                            └───────┬──────────────────┬────────┘
                                    │                  │
                writes job/metadata │                  │ enqueue work
                                    ▼                  ▼
                            ┌───────────────┐   ┌────────────────────────┐
                            │  Firestore    │   │  Cloud Tasks queues    │
                            │  (metadata)   │   │  - expand-sitemap      │
                            └───────▲───────┘   │  - capture-page        │
                                    │           └───────┬────────────────┘
                                    │ status updates    │ HTTP push (rate-limited)
                                    │                   ▼
                                    │        ┌────────────────────────────┐
                                    └────────│  Worker service            │ Cloud Run
                                             │  (Node + Playwright +      │ (min=0, concurrency=1)
                                             │   headless Chromium)       │
                                             │  - load page, screenshot   │
                                             │  - upload blob to GCS      │
                                             │  - write capture metadata  │
                                             └───────┬────────────────────┘
                                                     │ store image/thumb
                                                     ▼
                                             ┌────────────────┐
                                             │  Cloud Storage │  screenshots, thumbnails,
                                             │  (GCS bucket)  │  optional MHTML/DOM dumps
                                             └────────────────┘

   Cloud Scheduler ──(cron)──▶ API control plane ──▶ creates Capture Jobs for due Schedules
```

### 4.1 Request flow

1. **Submit.** Client calls `POST /v1/jobs` with a list of URLs and/or a `sitemapUrl`,
   plus capture options (viewport, full-page, formats). The API normalizes/validates
   input, creates a `CaptureJob` doc in Firestore, and:
   - For raw URLs: enqueues one `capture-page` task per URL.
   - For a sitemap: enqueues a single `expand-sitemap` task.
2. **Expand sitemap (if any).** A worker handler fetches the `sitemap.xml`, parses it
   (including `<sitemapindex>` nested sitemaps), de-dupes URLs, applies any include/
   exclude filters, caps the count against the job's `maxUrls`, then enqueues one
   `capture-page` task per URL.
3. **Capture page.** For each `capture-page` task, the worker launches/reuses a
   headless Chromium context, navigates to the URL, waits for the page to settle,
   captures a screenshot (and optional thumbnail + DOM/MHTML), uploads blobs to GCS,
   and writes a `PageCapture` doc. It increments completion counters on the parent job.
4. **Complete.** When all page captures resolve (success or terminal failure), the job
   is marked `completed` (or `completed_with_errors`).
5. **Browse.** The Viewer UI / API queries Firestore by Target + URL to list captures
   over time and renders thumbnails from GCS (served via signed URLs or a CDN).

## 5. GCP Infrastructure Choices

### 5.1 Compute: Cloud Run (not App Engine) for the worker

The existing `apps/root-services` uses **App Engine standard** (Go). For the screenshot
worker we instead propose **Cloud Run**, because:

- Headless Chromium needs a **custom container** with system libraries and a large
  binary — App Engine standard can't ship arbitrary native deps cleanly, and the
  flexible environment is effectively containers-on-Compute-Engine with slower scaling.
- Cloud Run scales to **zero** (no idle cost when nothing is being captured) and scales
  out per request, which matches bursty fan-out workloads.
- We can pin **`concurrency = 1`** per worker instance so each Chromium render gets a
  full CPU/RAM slice and one crash can't take down sibling renders.
- Generous per-request CPU/memory (e.g. 2 vCPU / 2–4 GiB) and request timeouts up to
  60 min cover heavy pages.

The **API/control plane** is a separate, lightweight Cloud Run service (Node + TS). It
could also be App Engine, but keeping both on Cloud Run simplifies the container build
and IAM story. Both deploy via `gcloud run deploy` (mirroring the `deploy.sh` pattern in
`apps/root-services`).

> Two services, one repo: `apps/root-archive/api` and `apps/root-archive/worker`,
> sharing a `packages`-style internal `shared/` module for types and the Firestore/GCS
> clients.

### 5.2 Queue: Cloud Tasks (not Pub/Sub)

Cloud Tasks is preferred over Pub/Sub for the capture fan-out because:

- **Per-queue rate limiting** (`maxDispatchesPerSecond`, `maxConcurrentDispatches`) lets
  us be a polite citizen and avoid hammering a target site or our own worker fleet.
- **Per-task scheduling** (`scheduleTime`) supports jitter/backoff and politeness delays
  between hits on the same origin.
- **HTTP push to Cloud Run** with built-in retry/backoff and OIDC auth — no consumer to
  run, and failures retry automatically with a configurable max-attempts dead-letter.
- Tasks map 1:1 to a unit of work (one page), which is the natural granularity here.

Two queues:

- `expand-sitemap` — low rate, fetches and fans out.
- `capture-page` — the high-volume queue, rate-limited per the worker fleet's capacity.

> Politeness: we can route all URLs of a single origin through a deterministic delay or
> a per-origin token so we never exceed N req/s against one site.

### 5.3 Metadata: Firestore

Consistent with `root-cms`, which writes directly to Firestore. Native mode, with
collections described in §6. Firestore gives us cheap point reads for "history of one
URL", composite indexes for time-ordered queries, and atomic counters for job progress.

### 5.4 Blobs: Cloud Storage

One bucket (or one per environment), consistent with `apps/root-services`' GCS usage.
Layout is content-addressed where useful and human-navigable otherwise:

```
gs://<bucket>/
  captures/<targetId>/<urlHash>/<captureId>/
      screenshot.png        # full-page (or viewport) capture
      thumbnail.webp        # small preview for the gallery UI
      page.mhtml            # optional: single-file DOM snapshot
      metadata.json         # denormalized copy of the Firestore doc (self-contained)
```

- Objects are immutable once written; we never overwrite a capture.
- **Object Lifecycle Management** handles retention (e.g. move to Nearline/Coldline after
  90 days, delete after N years) per Target policy.
- **Dedup option:** store the screenshot under a key derived from its **content hash**
  (`sha256`) and point captures at it, so identical consecutive snapshots of an unchanged
  page don't duplicate bytes. The `PageCapture` doc records `imageHash`; if it matches the
  previous capture we can flag `unchanged: true` and optionally skip re-storing.

### 5.5 Scheduling: Cloud Scheduler

A single Cloud Scheduler cron (e.g. every 15 min) calls an internal API endpoint that
queries Firestore for `Schedule`s whose `nextRunAt <= now`, creates a `CaptureJob` for
each, and advances `nextRunAt`. This keeps all recurrence logic in our own data model
(easy to add/inspect schedules) rather than one Scheduler job per Target.

### 5.6 Serving images

For the viewer, screenshots are served either via **signed GCS URLs** (short-lived,
generated by the API) or, for a public archive, via a public bucket fronted by **Cloud
CDN / a load balancer**. Thumbnails are pre-generated (WebP) at capture time so the
gallery is cheap to render. The repo already has an image-serving precedent in
`apps/root-services` (App Engine Images serving URLs); for v1 the simpler signed-URL /
CDN path is recommended.

## 6. Data Model (Firestore)

```
targets/{targetId}
  origin: string                 // normalized, e.g. "https://example.com"
  displayName: string
  createdAt: Timestamp
  createdBy: string              // user email / id
  defaultOptions: CaptureOptions
  latestCaptureAt: Timestamp | null

targets/{targetId}/schedules/{scheduleId}
  cron: string                   // e.g. "0 9 * * *"  (or interval form)
  source: { type: "urls", urls: string[] }
         | { type: "sitemap", sitemapUrl: string, maxUrls: number }
  options: CaptureOptions
  enabled: boolean
  nextRunAt: Timestamp
  lastRunAt: Timestamp | null

jobs/{jobId}
  targetId: string
  status: "pending" | "expanding" | "running"
        | "completed" | "completed_with_errors" | "failed"
  source: { type: "urls", urls: string[] }
         | { type: "sitemap", sitemapUrl: string, maxUrls: number }
  options: CaptureOptions
  counts: { total: number, succeeded: number, failed: number, skipped: number }
  createdAt: Timestamp
  startedAt: Timestamp | null
  finishedAt: Timestamp | null
  scheduleId: string | null      // set if created by a Schedule
  createdBy: string

captures/{captureId}
  jobId: string
  targetId: string
  url: string                    // the exact captured URL
  urlHash: string                // sha256(url), used in GCS path + queries
  status: "succeeded" | "failed" | "skipped_unchanged"
  capturedAt: Timestamp
  httpStatus: number | null
  finalUrl: string | null        // after redirects
  viewport: { width: number, height: number, deviceScaleFactor: number }
  fullPage: boolean
  imageHash: string | null       // sha256 of screenshot bytes (dedup/diff)
  unchanged: boolean             // imageHash == previous capture's
  dimensions: { width: number, height: number } | null
  storage: {
    screenshot: string           // gs:// path
    thumbnail: string | null
    mhtml: string | null
  }
  pageTitle: string | null
  error: { code: string, message: string } | null
  timings: { navMs: number, captureMs: number, totalMs: number } | null
```

`CaptureOptions`:

```ts
interface CaptureOptions {
  viewport: { width: number; height: number; deviceScaleFactor?: number };
  fullPage: boolean;            // full scroll-height vs. just the viewport.
  format: 'png' | 'jpeg' | 'webp';
  waitUntil: 'load' | 'networkidle' | 'domcontentloaded';
  extraWaitMs?: number;         // settle time for animations/lazy content.
  blockResources?: ('ads' | 'analytics' | 'video' | 'font')[];
  hideSelectors?: string[];     // CSS selectors to hide (cookie banners, etc.).
  emulateMedia?: 'screen' | 'print';
  timeoutMs: number;            // hard cap per page.
  captureMhtml?: boolean;       // also store a single-file DOM snapshot.
}
```

### Key queries / indexes

- **History of one URL:** `captures where urlHash == ? order by capturedAt desc`
  (composite index on `urlHash, capturedAt`).
- **Captures of a job:** `captures where jobId == ? order by capturedAt`.
- **Due schedules:** `collectionGroup(schedules) where enabled == true and nextRunAt <= now`.

## 7. The Screenshot Worker

### 7.1 Runtime

- **Node + TypeScript** (consistent with the JS side of the repo) using **Playwright**
  with bundled Chromium. Playwright is preferred over raw Puppeteer for its robust
  auto-waiting, `networkidle`, MHTML/CDP access, and first-class Docker images.
- Container based on `mcr.microsoft.com/playwright` (ships Chromium + all system libs),
  or a slimmer custom image installing only Chromium deps.
- **One browser per instance, one page per request** (`concurrency = 1`). A fresh,
  isolated **browser context** per capture prevents cookie/cache bleed between sites.
- A small in-process warm-browser pool keeps Chromium launched between requests on a warm
  instance to amortize the ~0.5–1s launch cost.

### 7.2 Capture algorithm (per `capture-page` task)

1. Validate the URL (scheme `http(s)` only; reject private/loopback IPs — see §10 SSRF).
2. New browser context with the requested viewport + a realistic UA string.
3. Optionally install request interception to block ads/analytics/video for speed and
   determinism.
4. `page.goto(url, { waitUntil, timeout })`, then `extraWaitMs` settle; optionally hide
   configured selectors (cookie banners) and scroll to trigger lazy-loaded images for
   full-page shots.
5. `page.screenshot({ fullPage, type })`. Generate a `thumbnail.webp` via `sharp`.
   Optionally `page.pdf()` / CDP `captureSnapshot` (MHTML).
6. Compute `sha256` of the image; compare with the previous capture's `imageHash` for the
   same `urlHash`. If unchanged and dedup is on, mark `skipped_unchanged` and reference the
   existing blob instead of re-uploading.
7. Upload blobs to GCS; write the `PageCapture` doc; atomically bump the job's counters.
8. Return 2xx so Cloud Tasks marks the task done. On transient failure throw/return 5xx so
   Cloud Tasks retries with backoff; after `maxAttempts` it dead-letters and we record a
   terminal `failed` capture.

### 7.3 Reliability

- **Idempotency:** each `capture-page` task carries a deterministic `captureId`
  (`hash(jobId + url)`), so retries upsert the same doc/blob path rather than creating
  duplicates.
- **Timeouts:** a hard per-page `timeoutMs` plus the Cloud Run request timeout as a
  backstop; a watchdog kills a hung Chromium context.
- **Crash isolation:** `concurrency = 1` + per-request context means one bad page can't
  corrupt others; a fully wedged instance is recycled by Cloud Run health checks.

## 8. API Surface (control plane)

```
POST /v1/jobs
  body: { targetOrigin?, urls?: string[], sitemapUrl?, options?, maxUrls? }
  -> { jobId, status }

GET  /v1/jobs/{jobId}            -> job doc incl. counts/status
GET  /v1/jobs/{jobId}/captures   -> page captures for the job (paged)

GET  /v1/captures/{captureId}    -> single capture incl. signed image URLs
GET  /v1/captures?url=<url>      -> history of a URL over time (paged, time-desc)

POST /v1/targets/{id}/schedules  -> create a recurring schedule
GET  /v1/targets/{id}/schedules  -> list schedules
PATCH /v1/.../schedules/{id}     -> enable/disable/edit

POST /_internal/run-due-schedules  // called only by Cloud Scheduler (OIDC-authed)
POST /_internal/tasks/expand-sitemap   // Cloud Tasks push target (OIDC-authed)
POST /_internal/tasks/capture-page     // Cloud Tasks push target (OIDC-authed)
```

Public endpoints sit behind whatever auth the deployment needs (API key / IAP / Firebase
Auth). Internal `/_internal/*` endpoints accept only OIDC tokens from the project's
service accounts (Cloud Tasks / Scheduler), verified by Cloud Run's built-in IAM or
in-app token validation.

## 9. Viewer UI

A minimal front-end (naturally, a Root.js app — it's what this monorepo builds) that:

- Lists Targets and their capture history.
- Shows a **timeline / gallery** of thumbnails for a given URL, newest first.
- Opens a full-resolution screenshot with capture metadata (timestamp, viewport, status).
- (Stretch) A **diff view**: side-by-side or pixel-diff between two captures of the same
  URL, leveraging the stored `imageHash` to highlight "changed" snapshots.

## 10. Security & Abuse Considerations

- **SSRF / private-network protection (critical).** The worker fetches arbitrary
  user-supplied URLs, so it must refuse to hit internal addresses. Resolve the hostname and
  reject RFC 1918 / loopback / link-local / metadata (`169.254.169.254`) targets *before*
  navigation, re-check after redirects, and run the worker with **no privileged network
  access** to GCP internal endpoints (locked-down service account, VPC egress controls).
- **Resource exhaustion.** Per-job `maxUrls` cap, per-queue rate limits, per-page timeouts,
  and a global concurrency ceiling on the worker fleet (max instances). Optionally a per-
  user/day quota in Firestore.
- **Politeness.** Respect `robots.txt` (configurable), throttle per-origin request rate,
  send an identifying User-Agent, and honor a denylist of hosts we won't archive.
- **Content safety / storage.** Bucket is private by default; public serving (if any) is an
  explicit opt-in behind CDN. Lifecycle rules bound retention and cost.
- **Auth.** Public API behind IAP/Firebase Auth; internal task endpoints OIDC-only; least-
  privilege service accounts (worker: GCS write + Firestore write only; API: Firestore +
  Cloud Tasks enqueue).

## 11. Cost & Scaling

- **Dominant cost** is worker CPU-seconds (Chromium is heavy). With `concurrency=1` and
  ~2–8s per page, one instance does ~7–25 pages/min. Cloud Tasks rate caps + Cloud Run
  `maxInstances` bound the spend; scale-to-zero means no idle cost.
- **Storage** is cheap and bounded by lifecycle rules + content-hash dedup (unchanged pages
  cost ~nothing to re-snapshot).
- **Firestore** reads/writes are minimal per capture (a couple of writes, atomic counter
  bumps). Composite indexes keep history queries fast.
- Knobs: queue dispatch rate, worker `maxInstances`, viewport size, `fullPage` vs viewport,
  format (WebP/JPEG are far smaller than PNG), and capture frequency per schedule.

## 12. Alternatives Considered

| Decision | Chosen | Alternatives & why not |
| --- | --- | --- |
| Worker compute | **Cloud Run** | App Engine standard (can't run custom Chromium cleanly); GKE (operational overhead); Cloud Functions (gen2 is Cloud Run under the hood, but Run gives better control over concurrency/timeouts). |
| Queue | **Cloud Tasks** | Pub/Sub (no native per-task scheduling or simple rate limiting; needs a consumer); Workflows (overkill for fan-out). |
| Browser automation | **Playwright** | Puppeteer (fine, but Playwright's auto-wait, MHTML, and Docker images are nicer); Browserless/3rd-party SaaS (cost + data egress). |
| Metadata store | **Firestore** | Cloud SQL/Postgres (more ops, but better for complex relational queries — revisit if querying needs grow); BigQuery (great for analytics later, not for OLTP). |
| Blob store | **GCS** | — (the obvious choice; matches repo precedent). |
| Recurrence | **Self-managed Schedule docs + one Cloud Scheduler tick** | One Scheduler job per Target (hits Scheduler quotas, harder to inspect/edit). |

## 13. Observability

- **Structured logs** (Cloud Logging) per capture with `jobId`, `captureId`, `url`,
  timings, and outcome.
- **Metrics** (Cloud Monitoring): captures/min, success rate, p50/p95 capture latency,
  queue depth, worker instance count, GCS bytes written. Alerts on elevated failure rate or
  queue backlog.
- **Trace** the request → task → capture path with a correlation id propagated through the
  Cloud Tasks payload.
- **Dead-letter inspection:** failed tasks land in a dead-letter queue; a small dashboard or
  Firestore view surfaces terminally-failed captures for retry.

## 14. Rollout / Milestones

1. **M0 — Skeleton.** `apps/root-archive/{api,worker,shared}` scaffolding, Dockerfiles,
   `deploy.sh` (mirroring `apps/root-services`), Firestore/GCS clients, types.
2. **M1 — Single-URL capture.** `POST /v1/jobs` with raw URLs → Cloud Tasks → worker
   screenshots one page → GCS + Firestore. Manual verification.
3. **M2 — Sitemap expansion** + `maxUrls`, dedup by content hash, thumbnails.
4. **M3 — Schedules** + Cloud Scheduler tick + history API.
5. **M4 — Viewer UI** (gallery + full-res + metadata).
6. **M5 — Hardening:** SSRF guards, robots/politeness, quotas, observability dashboards,
   lifecycle policies. (Stretch: diff view, MHTML replay, recursive crawl.)

## 15. Open Questions

- **Auth model:** who can submit jobs — internal-only, API-key, or full Firebase Auth
  multi-tenant from day one?
- **Public vs private archive:** are screenshots ever served publicly (CDN) or always
  behind signed URLs?
- **Retention defaults:** how long do we keep captures, and is retention per-Target?
- **robots.txt:** respect by default with an override, or ignore for an archival use case?
- **Relational needs:** if reporting/analytics queries grow, do we add BigQuery export or
  move metadata to Cloud SQL?
- **Naming/publishing:** does this ship as an internal app only, or eventually a published
  `@blinkk/*` package + CLI?
```
