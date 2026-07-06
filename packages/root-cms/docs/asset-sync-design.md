# Design: Syncing Assets from External Sources (Figma, Google Drive, …)

Status: implemented (v1) — see `ui/utils/asset-sync/` for the engine and
providers, `ui/components/AssetBrowser/AssetSyncModals.tsx` for the UI, and
`assets.sync_proxy` in `core/api.ts` for the download relay.
Author: root-cms team

## 1. Overview

Add the ability to connect a folder in the asset library to an external
"sync source" — initially a Figma file/node — and import that source's
exportable assets into the folder. The connection is stored on the folder's
metadata so any authorized user can re-sync later. Auth credentials are
**per-user** (never stored with the folder), so only users who themselves
have access to the Figma file can perform a sync. The design is
provider-agnostic so that Google Drive folder syncing (planned) and other
sources can be added without reworking the data model or UI.

### Goals

- Connect an asset-library folder to a Figma file or node URL.
- Import every "exportable" node (nodes with export settings) as an asset
  in the folder, using each node's own export settings (format/scale).
- Re-sync on demand: update changed assets in place (so the existing
  asset→doc fan-out keeps docs fresh), add new ones, flag removed ones.
- Per-user credentials: a user's Figma token is used only for requests
  that user initiates; the token is never written to project-shared data.
- Store the source (URL/file key/node id) on the folder doc so the
  connection survives sessions and is visible to all project users.
- Extensible to other providers (Google Drive next).

### Non-goals (v1)

- Scheduled/cron background sync (requires server-held credentials; see
  §11 for how the design leaves room for it).
- Two-way sync or pushing edits back to Figma.
- Syncing Figma image *fills* or whole-page screenshots — v1 only exports
  nodes that designers explicitly marked exportable.

## 2. Building blocks already in the codebase

The design deliberately composes existing subsystems rather than adding a
parallel pipeline:

| Existing piece | Where | Role in this feature |
| --- | --- | --- |
| Asset library data layer | `ui/utils/assets.ts` | Folders/files at `Projects/<pid>/Assets/*`; `createAssetFile`, `replaceAssetFile`, `syncAssetToDocs` |
| Client-side GCS upload | `ui/utils/gcs.ts` (`uploadFileToGCS`) | Uploading downloaded exports; SHA-1 hash naming doubles as change detection |
| Asset→doc fan-out | `assets.ts` (`syncAssetToDocs`) | Propagating a re-synced asset to docs that embed it |
| Drive download helper | `ui/utils/gdrive.ts` (`downloadFromDrive`) | Template for per-user, client-side third-party fetch; becomes the Drive provider's `download()` |
| gapi OAuth hook | `ui/hooks/useGapiClient.ts` | Per-user credential precedent (browser-held, never server-stored); reused as-is for the Drive provider |
| Data sources | `ui/utils/data-source.ts`, `core/api.ts` (`data.sync`) | Structural template for "config doc + on-demand sync"; its cron model is the template for future scheduled sync |
| RPC API layer | `core/api.ts` (`/cms/api/<ns>.<verb>`) | Home for the optional download-proxy endpoint (§7.3) |
| Roles/ACL + rules | `core/security.ts`, `ui/utils/permissions.ts` | Gating who may sync (same as who may upload assets) |

The key architectural fact: **all asset writes are client-side** (Firebase
Storage + Firestore web SDKs under the signed-in user). The sync engine
therefore also runs client-side, which is what makes "the requesting
user's own Figma token" the natural and only credential involved.

## 3. High-level architecture

```
┌────────────────────────── Browser (CMS UI) ──────────────────────────┐
│                                                                      │
│  AssetBrowser ──▶ ConnectSyncSourceModal / SyncProgressModal         │
│                        │                                             │
│                        ▼                                             │
│              asset-sync engine (ui/utils/asset-sync/engine.ts)       │
│                │                │                    │               │
│      provider.list()   provider.download()   assets.ts writes        │
│                │                │                    │               │
│                ▼                ▼                    ▼               │
│        Figma REST API    export bytes        Firestore Assets/*      │
│      (user's own token)  (S3 URLs)           + uploadFileToGCS()     │
│                                              + syncAssetToDocs()     │
└──────────────────────────────────────────────────────────────────────┘
                     ▲
                     │ (fallback only, if CORS blocks a download)
        POST /cms/api/assets.sync_proxy  (host-allowlisted relay)
```

1. The user connects a folder to a Figma URL (stored on the folder doc).
2. "Sync now" runs the engine in the browser: enumerate exportables via
   the Figma API using the *current user's* token, download each export,
   upload to GCS, and create/replace `Assets/*` docs.
3. Replaced assets fan out to docs via the existing `syncAssetToDocs`.

No new server state is required for v1. The only (optional) server change
is a narrowly-scoped download relay for CORS fallback.

## 4. Data model

### 4.1 Folder metadata: the sync source

Extend `AssetFolder` (in `ui/utils/assets.ts`) with an optional `sync`
field. This is the durable, project-shared record of "what this folder is
connected to" — and it deliberately contains **no credentials**.

```ts
/** Sync-source connection stored on an AssetFolder doc. */
export interface AssetFolderSync {
  /** Provider id, e.g. 'figma' | 'gdrive'. */
  provider: string;
  /** The URL the user pasted, for display and re-parsing. */
  url: string;
  /** Provider-specific parsed source ref (exactly one is set). */
  figma?: {
    fileKey: string;
    /** Optional node id (API format, e.g. '12:345'). Absent = whole file. */
    nodeId?: string;
  };
  gdrive?: {
    folderId: string;
  };
  /** Sync options (provider-interpreted). */
  options?: {
    /**
     * Figma: fallback export format when a node's exportSettings are
     * honored per-setting; reserved for future "export children" modes.
     */
    defaultFormat?: 'png' | 'svg' | 'jpg' | 'pdf';
    defaultScale?: number;
  };
  connectedAt: Timestamp;
  connectedBy: string; // email
  /**
   * The provider's source version at the last fully-successful sync (e.g.
   * the Figma file `version`). Drives the §6.3 fast path: when the current
   * remote version matches, the sync skips downloads entirely. Only
   * advanced when a sync completes with zero failures, so failed items are
   * always retried.
   */
  lastRemoteVersion?: string;
  lastSyncedAt?: Timestamp;
  lastSyncedBy?: string;
  /** Result summary of the last completed sync. */
  lastSyncResult?: {
    ok: boolean;
    error?: string;
    added: number;
    updated: number;
    unchanged: number;
    /** Remote ids present last time but missing now (see §6.4). */
    missing: number;
    failed: number;
  };
  /**
   * Best-effort concurrency lease (see §6.5). Cleared when a sync
   * completes; treated as stale after 10 minutes.
   */
  state?: {
    status: 'syncing';
    startedAt: Timestamp;
    startedBy: string;
  };
}

export interface AssetFolder extends AssetBase {
  type: 'folder';
  sync?: AssetFolderSync;
}
```

Notes:

- Firestore write access to `Assets/*` already requires the EDITOR role
  (`core/security.ts` gives `userCanPublish()` write on project
  subcollections), so connecting/syncing is implicitly EDITOR+ — the same
  bar as uploading assets. The UI additionally gates with
  `testCanPublish()` from `ui/utils/permissions.ts`.
- ⚠️ `moveFolder()` in `assets.ts` re-creates the *top-level* folder doc
  from an explicit field list (unlike descendants, which are spread), so
  today a `sync` field would be silently dropped on rename/move. The
  implementation must carry `sync` (and any future extra fields — prefer
  spreading `...folder`) when building the new folder doc.
- Disconnecting a source deletes only the `sync` field
  (`updateDoc(ref, {sync: deleteField()})`); assets stay in place.

### 4.2 Per-asset provenance

Each synced file gets an optional `source` field on its `AssetFile` doc.
This is the identity that makes re-sync update-in-place instead of
duplicating, and it survives users renaming assets in the CMS:

```ts
export interface AssetSource {
  provider: string;            // 'figma'
  /** Stable remote identity. Figma: `${fileKey}:${nodeId}:${settingIndex}`. */
  remoteId: string;
  /** Human-readable remote name at last sync (Figma node name). */
  remoteName?: string;
  /** SHA-1 of the exported bytes at last sync (change detection, §6.3). */
  contentHash?: string;
  /** Provider-native content hash, when reported before download (Drive's
      `md5Checksum`; none for Figma). Skips the download when unchanged. */
  remoteHash?: string;
  /** The source version at the time this asset was written (informational;
      the fast path keys off the folder-level `sync.lastRemoteVersion`). */
  remoteVersion?: string;
  syncedAt: Timestamp;
  /** Set when a sync finds the remote node gone; never auto-deleted. */
  missingSince?: Timestamp;
}

export interface AssetFile extends AssetBase {
  type: 'file';
  file: UploadedFile;
  source?: AssetSource;
}
```

A Figma node with multiple export settings (e.g. PNG @1x + @2x + SVG)
produces multiple assets, hence `settingIndex` in `remoteId`.

### 4.3 Per-user credentials

Requirement: the token belongs to the requesting user, so Figma's own
ACL decides who can sync. Two viable homes, with a clear v1 pick:

**v1 (recommended): browser `localStorage`, per user + project.**

```
key:   root-cms::<projectId>::asset-sync::figma::token
value: the user's Figma personal access token (PAT)
```

- Matches the existing precedent (`useGapiClient` caches Google consent
  in localStorage; Google access tokens live only in browser memory).
- The token never touches Firestore or the CMS server — the only party
  that ever sees it is `api.figma.com`. No security-rules migration, no
  encryption-at-rest question, nothing for other project members to read.
- Cost: the user re-enters the PAT per browser/device. Acceptable for v1;
  the "connect" modal detects a missing/invalid token and prompts inline.

**Later (documented alternative): Firestore `UserSecrets/{uid}` docs**
outside the `Projects/` namespace, guarded by
`request.auth.uid == uid` rules (rules ship in `core/security.ts` and are
applied via `applySecurityRules`, so this is a deployable migration).
This buys cross-device persistence and is a stepping stone toward
server-mediated OAuth (§11), but it puts long-lived secrets in the DB —
defer until OAuth (short-lived tokens + refresh) makes that worthwhile.

A small client util owns this concern so the storage backend can change
without touching providers:

```ts
// ui/utils/asset-sync/tokens.ts
export function getProviderToken(provider: string): string | null;
export function setProviderToken(provider: string, token: string): void;
export function clearProviderToken(provider: string): void;
```

## 5. Provider abstraction

All provider-specific logic sits behind one interface in
`ui/utils/asset-sync/provider.ts`; the engine, data model, and UI are
provider-agnostic. Adding Google Drive later = adding one file that
implements this interface and registering it.

```ts
/** An exportable item discovered at the remote source. */
export interface RemoteAsset {
  /** Stable id, unique within the source (see AssetSource.remoteId). */
  remoteId: string;
  /** Remote display name (used to derive the asset name). */
  name: string;
  /** Suggested filename incl. extension, e.g. 'icon-arrow@2x.png'. */
  filename: string;
  /** Provider version hint, when available without downloading. */
  remoteVersion?: string;
  /** Provider content hash, when available (Drive md5); Figma: none. */
  contentHash?: string;
  /** Opaque provider payload needed by download() (e.g. render URL). */
  ref: unknown;
}

export interface SyncAuthContext {
  /** Returns a token, prompting the user (modal) if needed. */
  getToken(): Promise<string>;
  /** Marks the stored token invalid (e.g. after a 403) and re-prompts. */
  invalidateToken(): void;
}

export interface AssetSyncProvider {
  id: string;                  // 'figma'
  label: string;               // 'Figma'
  /** Parses a pasted URL into a source ref, or null if unrecognized. */
  parseSourceUrl(url: string): Partial<AssetFolderSync> | null;
  /** Validates auth + access to the source (e.g. GET /v1/me + file HEAD). */
  checkAccess(sync: AssetFolderSync, auth: SyncAuthContext): Promise<void>;
  /** Enumerates exportable assets at the source. */
  listRemoteAssets(
    sync: AssetFolderSync,
    auth: SyncAuthContext
  ): Promise<RemoteAsset[]>;
  /** Downloads one asset's bytes as a File (name = asset.filename). */
  download(asset: RemoteAsset, auth: SyncAuthContext): Promise<File>;
}

// ui/utils/asset-sync/registry.ts
export const SYNC_PROVIDERS: Record<string, AssetSyncProvider>;
```

`parseSourceUrl` lets the connect modal accept a bare URL and auto-detect
the provider (first provider whose parser matches wins).

### 5.1 Figma provider (`ui/utils/asset-sync/providers/figma.ts`)

**URL parsing.** Accept both current and legacy forms:

```
https://www.figma.com/design/<fileKey>/<title>?node-id=12-345
https://www.figma.com/file/<fileKey>/<title>?node-id=12-345
```

`fileKey` is the path segment after `/design/` or `/file/`; `node-id`
uses `-` in URLs but `:` in the API (`12-345` → `12:345`). Branch URLs
(`/design/<fileKey>/branch/<branchKey>/…`) use the branch key as the
effective file key. No node id ⇒ sync the whole file.

**Auth.** v1 uses a personal access token (PAT) sent as the
`X-Figma-Token` header. Users create one in Figma settings with the
read-only *File content* scope (`file_content:read`). `checkAccess` calls
`GET /v1/me` (token validity) then a cheap file fetch
(`GET /v1/files/<key>?depth=1`) to confirm the user can read this file —
a 403/404 here is precisely the "user lacks access to this Figma file"
signal, surfaced verbatim in the UI. OAuth is a later swap (§11): same
interface, `Authorization: Bearer` instead.

**Enumeration.** "Exportable" = nodes with non-empty `exportSettings`
(designers marked them in Figma's Export panel):

1. Fetch the tree: `GET /v1/files/<fileKey>/nodes?ids=<nodeId>` when a
   node is specified (returns the full subtree), else
   `GET /v1/files/<fileKey>`. Record the response's file `version` as
   `remoteVersion` for all items.
2. Walk the tree collecting `(node, exportSetting, settingIndex)` for
   every node with `exportSettings`. Each setting carries
   `format` (PNG/JPG/SVG/PDF), `suffix`, and `constraint`
   (SCALE/WIDTH/HEIGHT + value).
3. Resolve render URLs with the images API, batched per (format, scale)
   combination to minimize calls:
   `GET /v1/images/<fileKey>?ids=<comma-separated>&format=png&scale=2`
   → `{images: {nodeId: url}}` (S3 URLs, valid ~30 days). WIDTH/HEIGHT
   constraints map to the images API's `scale` by computing
   `value / node bounding box size` (matching Figma's own export math).
4. Build `RemoteAsset`s:
   - `remoteId = ${fileKey}:${nodeId}:${settingIndex}`
   - `filename = sanitize(nodeName) + (suffix || '') + '.' + ext` —
     Figma names commonly contain `/` (e.g. `icon/24/arrow`), which is
     invalid in asset names (`validateAssetName`); replace `/` and `\`
     with `-`, trim, and de-dupe collisions with a ` (2)` counter.
   - `ref = {url}` (the render URL) for `download()`.

**Download.** `fetch(ref.url)` (S3 render URLs are unauthenticated) →
`new File([blob], filename, {type: mime})`. See §7.3 for the CORS
fallback path.

**Rate limits.** Figma rate-limits per user/token. The engine bounds
download concurrency (default 4) and the provider batches `/v1/images`
ids (Figma accepts large id lists per call); on 429, back off using the
`Retry-After` header and resume.

### 5.2 Google Drive provider (future, validates the abstraction)

- `parseSourceUrl`: `https://drive.google.com/drive/folders/<folderId>`.
- Auth: the existing `useGapiClient` OAuth flow with
  `drive.readonly` — the `SyncAuthContext` wraps `gapiClient.login()`,
  so per-user access enforcement works identically (Drive's ACL decides).
- `listRemoteAssets`: `drive.files.list({q: '<folderId>' in parents})`;
  Drive supplies `md5Checksum` + `modifiedTime`, so `contentHash` is
  known **before** download and unchanged files skip download entirely
  (an optimization Figma can't offer).
- `download`: existing `downloadFromDrive()` nearly verbatim.

Nothing in the engine, schema, or UI changes — which is the test the
abstraction has to pass.

## 6. Sync engine (`ui/utils/asset-sync/engine.ts`)

```ts
export async function syncFolder(
  folder: AssetFolder,
  auth: SyncAuthContext,
  onProgress?: (p: SyncProgress) => void
): Promise<SyncSummary>;
```

### 6.1 Algorithm

1. **Lease.** Set `sync.state = {status:'syncing', startedAt, startedBy}`
   on the folder doc (see §6.5).
2. **Enumerate remote.** `provider.listRemoteAssets(folder.sync, auth)`.
3. **Enumerate local.** `listAssets(folderPath)` → index the folder's
   `AssetFile`s by `source.remoteId` (assets without `source`, i.e.
   manually uploaded files coexisting in the folder, are ignored).
4. **Diff & apply**, with bounded concurrency:
   - **New** (`remoteId` not present locally): `download()` →
     `uploadFileToGCS(file)` → `createAssetFile({parent, file, name})`
     extended to accept `source`.
   - **Existing**: skip cheaply when the provider gives a pre-download
     hash that matches (`contentHash`, Drive). Otherwise `download()`,
     compute SHA-1 (the same `sha1()` gcs.ts already uses for naming);
     if it equals `source.contentHash` → **unchanged**: a strict no-op —
     no GCS upload, no asset doc write, and no doc fan-out (see §6.3).
     If different → `uploadFileToGCS` → `replaceAssetFile(asset, file)`
     (which already preserves alt text and fixes the display-name
     extension) → **`syncAssetToDocs(asset, {previousFile})`** so every
     doc embedding the asset picks up the new export — this is the
     payoff of reusing the asset library's fan-out. `syncAssetToDocs`
     is called *only* on this changed-bytes path, and only for the
     individual asset that changed — never folder-wide.
     Clear `missingSince` if it was set.
   - **Missing** (local `source.remoteId` absent remotely): set
     `source.missingSince` (once). **Never auto-delete** — published docs
     may embed the asset; deletion stays a deliberate human action,
     consistent with `deleteAsset()`'s philosophy of leaving GCS blobs.
5. **Finalize.** Update the folder doc: `lastSyncedAt/By`,
   `lastSyncResult` counts, clear `state`. Log via
   `logAction('asset.sync_source', {...})` for the audit trail.

Per-item failures don't abort the run; they're collected into the
summary (same spirit as `syncAssetToDocs`'s `failedDocIds`).

### 6.2 Why identity is `remoteId`, not name

Names change in both systems (designers rename layers; editors rename
assets). Keying the diff on `source.remoteId` means: renames in Figma
update the file in place (optionally offering to update the asset's
display name), renames in the CMS stick, and moving an asset *out* of
the folder simply causes the next sync to import a fresh copy into the
folder (the moved asset keeps working, now unmanaged — its `source`
could be cleared on move as a refinement).

### 6.3 Change detection — unchanged files cause zero writes and zero fan-out

Invariant: **a file whose exported bytes are unchanged since the last
sync produces no side effects** — no GCS upload, no `Assets/*` doc
write, no `modifiedAt` bump, and above all no `syncAssetToDocs` fan-out
(which would otherwise rewrite every draft doc embedding the asset and
churn `sys.modifiedAt`/`sys.modifiedBy` across the project). Re-syncing
a folder where nothing changed leaves both the asset library and all
docs byte-for-byte identical.

The invariant is enforced by three tiers of checks, cheapest first:

1. **File-version fast path (skips the whole sync):** if the file
   `version` returned during enumeration equals the folder's
   `sync.lastRemoteVersion` (recorded on the last fully-successful sync)
   and the folder still contains every synced asset, the whole file is
   untouched → finish immediately with "everything up to date" (no image
   renders, no downloads, no per-file writes). Keeping this marker on the
   folder (rather than per-asset) means unchanged-but-re-versioned files
   never need a metadata write to keep the fast path armed.
2. **Provider hash skip (skips the download):** when the provider
   exposes a content hash before download (Drive's `md5Checksum`;
   Figma has none), a match against `source.contentHash` skips the
   item without downloading.
3. **Byte hash skip (skips all writes):** otherwise download and SHA-1
   the bytes (the same `sha1()` gcs.ts already uses for naming); a
   match against `source.contentHash` ends the item as **unchanged**
   before any upload or Firestore write. Only a hash mismatch proceeds
   to `replaceAssetFile` + per-asset `syncAssetToDocs`.

(GCS hash-naming means identical bytes would produce the same `src`
anyway, so a redundant replace would be *visually* harmless — but it
would still dirty asset/doc timestamps and trigger doc writes, which is
why the skip happens before any write, not after.)

### 6.4 Removed-in-source assets

Flagged (`missingSince`), surfaced in the sync summary and with a badge
in the folder view ("No longer in Figma"), deletable via the normal
asset delete flow. This protects docs that embed the asset and respects
that the asset library is the system of record once assets are in use.

### 6.5 Concurrency

Two editors clicking "Sync now" concurrently would race on the same
assets. The `sync.state` lease is best-effort protection: the UI warns
"A sync started by <email> <n> min ago is in progress" and requires an
explicit override; leases older than 10 minutes are treated as stale
(abandoned tab). Races that slip through are benign — both writers
produce the same content-addressed GCS objects and equivalent docs.

## 7. Security

### 7.1 Trust model

- **Who can sync:** anyone who is (a) an EDITOR+ on the CMS project
  (enforced by existing Firestore rules on `Assets/*` writes, plus UI
  gating) **and** (b) can read the Figma file *with their own token*
  (enforced by Figma returning 403 otherwise). Requirement satisfied by
  construction: there is no shared/service credential to borrow.
- **Token blast radius:** v1 tokens live only in the user's browser and
  are sent only to `api.figma.com`. Recommend users create PATs scoped
  to `file_content:read` only.
- **Folder metadata is not sensitive:** `sync` holds a URL and file key —
  visible to all project users by design (VIEWERs can already read all
  project data), which is fine since the URL is useless without access.

### 7.2 Firestore rules

No changes for v1. If/when tokens move server-side or to
`UserSecrets/{uid}` (§4.3), rules changes ship through the existing
`core/security.ts` → `applySecurityRules()` path.

### 7.3 CORS fallback proxy (only if needed)

`api.figma.com` is browser-callable, but the S3 render/download URLs may
not serve CORS headers in all cases. If direct `fetch` of export bytes
fails, the engine falls back to a minimal relay:

```
POST /cms/api/assets.sync_proxy   { url: string }
→ streams the response bytes back
```

Handler rules (in `core/api.ts`, following the `data.sync` template):
require an authenticated session (`req.user`), **allowlist the URL host**
to known provider download hosts (the Figma S3 export buckets) to prevent
SSRF, never forward client-supplied headers, cap response size, and
follow no cross-host redirects. The user's Figma token is *not* sent to
this endpoint — render URLs are pre-signed and unauthenticated, so the
proxy is a dumb, host-restricted byte relay. Implementation can verify
real CORS behavior first and drop this endpoint entirely if unneeded.

## 8. UI/UX

All in `ui/components/`, Mantine modals registered in `ui.tsx`'s
`ModalsProvider` map like the existing ones.

1. **Connect** — `AssetBrowser` (manage mode) folder context menu +
   folder-view header: “Connect sync source…” opens
   `ConnectSyncSourceModal`:
   - Paste URL → provider auto-detected via `parseSourceUrl` (Figma icon
     appears; Drive listed as "coming soon").
   - If no stored token: inline PAT field with a "how to create a token"
     link; token validated via `checkAccess` before saving.
   - Preview step: shows the exportables found ("14 exportable assets in
     ‘Icons / Nav’") so the user confirms scope before the first sync.
   - Connect ⇒ writes `folder.sync`, kicks off the first sync.
   - Also reachable as “New synced folder…” from the toolbar (creates
     folder + connects in one flow).
2. **Folder affordances** — synced folders show a provider badge and a
   header strip: “Synced from Figma · last synced 2h ago by
   jane@example.com · [Sync now] [⋯]”, where ⋯ = Open in Figma /
   Change source / Update my Figma token / Disconnect.
3. **Sync progress** — `SyncProgressModal`: enumerate → per-item
   progress (n/m with names) → summary (added / updated / unchanged /
   missing / failed, with per-item errors expandable). Runs are
   cancelable between items.
4. **Errors** — 403 from Figma renders as “Your Figma account doesn’t
   have access to this file” with a re-auth shortcut; invalid/expired
   token auto-triggers the token prompt via
   `SyncAuthContext.invalidateToken()`.
5. **Permissions** — connect/sync/disconnect hidden for non-editors via
   `testCanPublish()` (matching what the rules enforce anyway).

## 9. Server changes

- v1: none required, except the optional §7.3 proxy endpoint.
- `window.__ROOT_CTX` and `CMSPluginOptions` untouched for PAT-based v1.
  (OAuth later adds `cmsPlugin({figma: {clientId}})` + a token-exchange
  endpoint; see §11.)

## 10. Implementation plan

**Phase 1 — foundations**
- `ui/utils/asset-sync/{provider,registry,tokens,engine}.ts` + types.
- Extend `AssetFile`/`AssetFolder` types with `source`/`sync`;
  `createAssetFile` accepts `source`; fix `moveFolder` to preserve extra
  folder fields (`sync`) on rename/move.
- Unit tests: URL parsing, name sanitization/dedupe, diff algorithm
  (new/changed/unchanged/missing) with a fake provider — including an
  explicit assertion that an all-unchanged re-sync performs zero
  uploads, zero Firestore writes, and zero `syncAssetToDocs` calls
  (the §6.3 invariant).

**Phase 2 — Figma provider + UI**
- `providers/figma.ts` (parse, checkAccess, enumerate, render-URL
  batching, download, 429 backoff).
- `ConnectSyncSourceModal`, `SyncProgressModal`, `AssetBrowser` folder
  badge/header/menu items.
- Verify S3 CORS empirically; add `assets.sync_proxy` only if required.

**Phase 3 — polish & follow-ups**
- "Missing in source" badge + bulk-delete flow for orphaned assets.
- Google Drive provider (reusing `useGapiClient` + `gdrive.ts`).
- Figma OAuth app support (replaces PATs; per-user tokens obtained via
  `Authorization: Bearer`, refresh handled server-side) — this is also
  the gateway to scheduled sync.

## 11. Future: scheduled (cron) sync

Deliberately out of scope for v1 because it conflicts with the per-user
credential requirement: a background job has no "requesting user". The
data model leaves room for it — `AssetFolderSync` can grow a `cron` field
mirroring `DataSourceCron`, executed by the existing `core/cron.ts` /
`/cms/api/cron.run` machinery. Credential options when we get there, in
order of preference:

1. **Per-user OAuth with server-held refresh tokens:** the user who
   enables the schedule consents to the CMS syncing "as them"; tokens
   stored server-side (Firestore doc readable only by admin SDK,
   encrypted with a server key), and the cron attributes syncs to that
   user. Access still degrades correctly if they lose Figma access.
2. **Project-level service token** (e.g. a Figma team PAT via
   `root.config.ts` env config): simplest, but weakens the per-user
   access property — acceptable only as an explicit admin opt-in.

## 12. Edge cases & open questions

- **Name collisions:** two Figma nodes exporting the same filename →
  deterministic ` (2)` suffixing by remoteId order; collisions with
  manually uploaded files in the folder are suffixed too.
- **Huge files:** whole-file connections on very large Figma files make
  `GET /v1/files/<key>` slow — nudge users toward node-scoped URLs in
  the connect modal; consider `depth`-limited pagination if it bites.
- **Nested structure:** v1 imports a flat list into the folder. Mapping
  Figma page/frame hierarchy (or `/`-namespaced layer names) onto asset
  subfolders is a possible option later; flat keeps the diff and the
  mental model simple.
- **SVG/PDF handling:** exports inherit existing asset-library behavior
  (SVG previews fine; PDF is a plain file asset) — no special-casing.
- **Folder deletion:** `deleteAsset` already requires empty folders;
  deleting the last synced assets then the folder implicitly drops the
  connection — no dangling state anywhere else.
- **Open question — token entry friction:** is per-device PAT entry
  acceptable for the team's workflow, or should `UserSecrets/{uid}`
  storage (§4.3) ship in v1? Recommendation: start with localStorage,
  gather feedback.
- **Open question — export scope:** v1 honors designers' export
  settings. Do we also need "export all children of this frame as PNG"
  for teams that don't mark exports? The `options.defaultFormat/Scale`
  fields reserve space for that mode.
