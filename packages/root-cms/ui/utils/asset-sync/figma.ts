/**
 * @fileoverview Figma sync provider.
 *
 * Enumerates the "exportable" nodes of a Figma file/node -- nodes whose
 * designers added export settings in Figma's Export panel -- and downloads
 * each export via the Figma images API, honoring each setting's format and
 * scale. Auth uses the requesting user's own personal access token (sent as
 * `X-Figma-Token`), so only users with access to the Figma file can sync.
 *
 * API docs: https://www.figma.com/developers/api
 */

import {sanitizeAssetName} from './names.js';
import {
  AssetSyncProvider,
  RemoteAsset,
  RemoteAssetList,
  SyncAccessError,
  SyncAuthContext,
  SyncSourceRef,
  SyncTokenRequiredError,
} from './types.js';

const FIGMA_API_ORIGIN = 'https://api.figma.com';

const FIGMA_HOSTNAMES = ['www.figma.com', 'figma.com'];

/** Path segments that precede a file key in Figma URLs. */
const FIGMA_URL_FILE_TYPES = ['design', 'file', 'proto'];

/** Max node ids per images API request (keeps request URLs a sane size). */
const IMAGES_BATCH_SIZE = 50;

/** Max retries for rate-limited (429) API requests. */
const MAX_RATE_LIMIT_RETRIES = 3;

/** Formats supported by the Figma images API. */
type FigmaExportFormat = 'png' | 'jpg' | 'svg' | 'pdf';

const MIME_TYPES: Record<FigmaExportFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
};

interface FigmaExportSetting {
  suffix?: string;
  format?: string;
  constraint?: {type?: 'SCALE' | 'WIDTH' | 'HEIGHT'; value?: number};
}

interface FigmaNode {
  id: string;
  name: string;
  visible?: boolean;
  exportSettings?: FigmaExportSetting[];
  absoluteBoundingBox?: {width?: number; height?: number};
  children?: FigmaNode[];
}

/** Download payload attached to each RemoteAsset. */
interface FigmaAssetRef {
  nodeId: string;
  format: FigmaExportFormat;
  scale: number;
  /** Render URL, resolved in `prepareDownloads()`. */
  url?: string;
}

export interface FigmaSourceRef {
  fileKey: string;
  nodeId?: string;
}

/**
 * Parses a Figma file/node URL into a file key + optional node id.
 * Supported forms:
 *
 *   https://www.figma.com/design/<fileKey>/<title>?node-id=12-345
 *   https://www.figma.com/file/<fileKey>/<title>  (legacy)
 *   https://www.figma.com/design/<fileKey>/branch/<branchKey>/<title>
 *
 * The `node-id` query param uses `-` as the separator but the API expects
 * `:`, e.g. `12-345` -> `12:345`. Branch URLs use the branch key as the
 * effective file key.
 */
export function parseFigmaUrl(url: string): FigmaSourceRef | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!FIGMA_HOSTNAMES.includes(parsed.hostname)) {
    return null;
  }
  const parts = parsed.pathname.split('/').filter(Boolean);
  const typeIndex = parts.findIndex((p) => FIGMA_URL_FILE_TYPES.includes(p));
  if (typeIndex === -1 || parts.length < typeIndex + 2) {
    return null;
  }
  let fileKey = parts[typeIndex + 1];
  // Branch URLs: /design/<fileKey>/branch/<branchKey>/<title>.
  if (parts[typeIndex + 2] === 'branch' && parts[typeIndex + 3]) {
    fileKey = parts[typeIndex + 3];
  }
  if (!/^[A-Za-z0-9]+$/.test(fileKey)) {
    return null;
  }
  // `node-id` query params use `-` but the API expects `:`, e.g. `12-345`.
  const nodeIdParam = parsed.searchParams.get('node-id');
  const nodeId = nodeIdParam ? nodeIdParam.replace(/-/g, ':') : undefined;
  return {fileKey, ...(nodeId ? {nodeId} : {})};
}

/**
 * Calls the Figma REST API, mapping auth failures to typed errors and
 * retrying rate-limited requests with backoff.
 */
async function figmaFetch(path: string, token: string): Promise<any> {
  let attempt = 0;
  for (;;) {
    const res = await fetch(`${FIGMA_API_ORIGIN}${path}`, {
      headers: {'X-Figma-Token': token},
    });
    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      attempt += 1;
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      const delaySeconds = Math.min(Math.max(retryAfter, 5 * attempt), 60);
      await sleep(delaySeconds * 1000);
      continue;
    }
    if (res.ok) {
      return await res.json();
    }
    const body = await res.json().catch(() => ({}));
    const errMessage = String(body?.err || body?.message || '');
    // Figma responds 403 both for invalid tokens and for missing file
    // access; the error body distinguishes the two.
    if (
      res.status === 401 ||
      (res.status === 403 && errMessage.toLowerCase().includes('token'))
    ) {
      throw new SyncTokenRequiredError(
        'figma',
        'Your Figma token is invalid or expired.'
      );
    }
    if (res.status === 403) {
      throw new SyncAccessError(
        "Your Figma account doesn't have access to this file."
      );
    }
    if (res.status === 404) {
      throw new SyncAccessError(
        'Figma file not found. Check the URL, or ask for access to the file.'
      );
    }
    throw new Error(
      `Figma API request failed (${res.status})${
        errMessage ? `: ${errMessage}` : ''
      }`
    );
  }
}

function sleep(millis: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, millis));
}

function normalizeFormat(format?: string): FigmaExportFormat | null {
  const normalized = String(format || 'png').toLowerCase();
  if (normalized === 'jpeg') {
    return 'jpg';
  }
  if (normalized in MIME_TYPES) {
    return normalized as FigmaExportFormat;
  }
  return null;
}

/**
 * Resolves an export setting's constraint to the images API's `scale`
 * param. WIDTH/HEIGHT constraints are converted using the node's bounding
 * box (matching Figma's own export behavior). The API accepts 0.01-4.
 */
function getExportScale(node: FigmaNode, setting: FigmaExportSetting): number {
  const constraint = setting.constraint;
  const clamp = (value: number) => Math.min(Math.max(value, 0.01), 4);
  if (!constraint || constraint.type === 'SCALE' || !constraint.type) {
    return clamp(constraint?.value || 1);
  }
  const box = node.absoluteBoundingBox;
  const size = constraint.type === 'WIDTH' ? box?.width : box?.height;
  if (!size || !constraint.value) {
    return 1;
  }
  return clamp(constraint.value / size);
}

/**
 * Builds the export filename for a node + export setting, e.g. a node named
 * `icon/24/arrow` with suffix `@2x` and format PNG becomes
 * `icon-24-arrow@2x.png`.
 */
export function buildExportFilename(
  nodeName: string,
  setting: FigmaExportSetting
): string {
  const format = normalizeFormat(setting.format) || 'png';
  const suffix = String(setting.suffix || '');
  const base = sanitizeAssetName(`${nodeName}${suffix}`);
  return `${base}.${format}`;
}

/** Walks a node tree collecting nodes with export settings. */
function collectExportableNodes(
  roots: FigmaNode[]
): Array<{node: FigmaNode; setting: FigmaExportSetting; index: number}> {
  const found: Array<{
    node: FigmaNode;
    setting: FigmaExportSetting;
    index: number;
  }> = [];
  const visit = (node: FigmaNode) => {
    if (!node || node.visible === false) {
      return;
    }
    const settings = node.exportSettings || [];
    settings.forEach((setting, index) => {
      if (normalizeFormat(setting.format)) {
        found.push({node, setting, index});
      }
    });
    (node.children || []).forEach(visit);
  };
  roots.forEach(visit);
  return found;
}

async function listRemoteAssets(
  source: SyncSourceRef,
  auth: SyncAuthContext
): Promise<RemoteAssetList> {
  const figma = source.figma;
  if (!figma?.fileKey) {
    throw new Error('Missing Figma file key.');
  }
  const token = await auth.getToken();

  let version: string | undefined;
  let roots: FigmaNode[];
  if (figma.nodeId) {
    const data = await figmaFetch(
      `/v1/files/${encodeURIComponent(figma.fileKey)}/nodes?ids=${encodeURIComponent(figma.nodeId)}`,
      token
    );
    version = data?.version ? String(data.version) : undefined;
    const nodeData = data?.nodes?.[figma.nodeId];
    if (!nodeData?.document) {
      throw new SyncAccessError(
        `Node ${figma.nodeId} was not found in the Figma file. It may have been deleted; try re-connecting with an updated URL.`
      );
    }
    roots = [nodeData.document];
  } else {
    const data = await figmaFetch(
      `/v1/files/${encodeURIComponent(figma.fileKey)}`,
      token
    );
    version = data?.version ? String(data.version) : undefined;
    roots = data?.document ? [data.document] : [];
  }

  const exportables = collectExportableNodes(roots);
  const assets: RemoteAsset[] = exportables.map(({node, setting, index}) => {
    const format = normalizeFormat(setting.format)!;
    const ref: FigmaAssetRef = {
      nodeId: node.id,
      format: format,
      scale: getExportScale(node, setting),
    };
    return {
      // A node with multiple export settings (e.g. PNG @1x + @2x + SVG)
      // produces one asset per setting.
      remoteId: `${figma.fileKey}:${node.id}:${index}`,
      name: node.name,
      filename: buildExportFilename(node.name, setting),
      ref: ref,
    };
  });
  return {version, assets};
}

/**
 * Resolves render URLs for the assets that need downloading. Requests are
 * batched per (format, scale) combination -- one images API call renders
 * many nodes.
 */
async function prepareDownloads(
  assets: RemoteAsset[],
  source: SyncSourceRef,
  auth: SyncAuthContext
): Promise<void> {
  const fileKey = source.figma?.fileKey;
  if (!fileKey) {
    throw new Error('Missing Figma file key.');
  }
  const token = await auth.getToken();

  const groups = new Map<string, RemoteAsset[]>();
  for (const asset of assets) {
    const ref = asset.ref as FigmaAssetRef;
    const groupKey = `${ref.format}:${ref.scale.toFixed(4)}`;
    const group = groups.get(groupKey) || [];
    group.push(asset);
    groups.set(groupKey, group);
  }

  for (const group of groups.values()) {
    const {format, scale} = group[0].ref as FigmaAssetRef;
    for (let i = 0; i < group.length; i += IMAGES_BATCH_SIZE) {
      const batch = group.slice(i, i + IMAGES_BATCH_SIZE);
      const ids = Array.from(
        new Set(batch.map((a) => (a.ref as FigmaAssetRef).nodeId))
      );
      const params = new URLSearchParams({
        ids: ids.join(','),
        format: format,
      });
      if (format === 'png' || format === 'jpg') {
        params.set('scale', String(scale));
      }
      const data = await figmaFetch(
        `/v1/images/${encodeURIComponent(fileKey)}?${params.toString()}`,
        token
      );
      if (data?.err) {
        throw new Error(`Figma image render failed: ${data.err}`);
      }
      const images: Record<string, string | null> = data?.images || {};
      for (const asset of batch) {
        const ref = asset.ref as FigmaAssetRef;
        ref.url = images[ref.nodeId] || undefined;
      }
    }
  }
}

async function download(asset: RemoteAsset): Promise<File> {
  const ref = asset.ref as FigmaAssetRef | undefined;
  if (!ref?.url) {
    throw new Error(
      `Figma could not render "${asset.name}". The node may be empty or invisible.`
    );
  }
  let res: Response;
  try {
    res = await fetch(ref.url);
  } catch {
    // Direct fetches of the render URL can fail on CORS; fall back to the
    // server-side relay (which only allows Figma download hosts).
    res = await fetchViaProxy(ref.url);
  }
  if (!res.ok) {
    throw new Error(`Failed to download "${asset.name}" (${res.status}).`);
  }
  const blob = await res.blob();
  return new File([blob], asset.filename, {type: MIME_TYPES[ref.format]});
}

async function fetchViaProxy(url: string): Promise<Response> {
  const res = await fetch('/cms/api/assets.sync_proxy', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({url}),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Download failed: ${err || res.status}`);
  }
  return res;
}

async function validateToken(
  token: string
): Promise<{valid: boolean; account?: string}> {
  const res = await fetch(`${FIGMA_API_ORIGIN}/v1/me`, {
    headers: {'X-Figma-Token': token},
  });
  if (!res.ok) {
    return {valid: false};
  }
  const me = await res.json().catch(() => ({}));
  return {valid: true, account: me?.email || me?.handle};
}

export const FIGMA_PROVIDER: AssetSyncProvider = {
  id: 'figma',
  label: 'Figma',
  tokenHelp: {
    text: 'Create a personal access token in Figma under Settings → Security → Personal access tokens, with read-only "File content" access. The token is stored only in this browser and is used to verify you have access to the file.',
    url: 'https://www.figma.com/developers/api#access-tokens',
  },
  parseSourceUrl: (url: string) => {
    const figma = parseFigmaUrl(url);
    if (!figma) {
      return null;
    }
    return {provider: 'figma', url, figma};
  },
  validateToken: validateToken,
  listRemoteAssets: listRemoteAssets,
  prepareDownloads: prepareDownloads,
  download: download,
};
