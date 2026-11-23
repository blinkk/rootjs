/**
 * CLI commands for creating, inspecting, and editing Root CMS UX Prototypes
 * (`root-cms prototypes.*`), enabling local AI coding harnesses (Claude Code,
 * Antigravity, Cursor, Codex) with full repo access to author high-fidelity
 * prototype boards and frames directly in Firestore.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {type RootConfig} from '@blinkk/root';
import {loadRootConfig} from '@blinkk/root/node';
import type {
  CollectionReference,
  DocumentReference,
  Firestore,
} from 'firebase-admin/firestore';
import {dim, green} from 'kleur/colors';
import {getCmsPlugin, RootCMSClient} from '../core/client.js';
import {loadPrototypeProjectContext} from '../core/prototype-context.js';
import {
  sanitizePrototypeCss,
  sanitizePrototypeHtml,
} from '../shared/prototype-render.js';
import {
  DEFAULT_PROTOTYPE_PAGES,
  getOrderedBlocks,
  type PrototypeAnnotation,
  type PrototypeBlock,
  type PrototypeBlockMap,
  type PrototypeBoard,
  type PrototypeBoardBundle,
  type PrototypeBoardPage,
  type PrototypeBoardStatus,
  type PrototypeBoardSummary,
  type PrototypeCommentItem,
  type PrototypeCommentThread,
  type PrototypeComponentSpec,
  type PrototypeFrame,
  type PrototypeTheme,
} from '../shared/prototypes.js';
import {getCliUser} from './cli-user.js';

const SAFE_DOC_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_BATCH_OPS = 450;
const FRAME_AUTO_GAP_X = 80;
const DEFAULT_FRAME_START_X = 80;
const DEFAULT_FRAME_START_Y = 80;

/** Common CLI context override flags for testing and multi-site setups. */
export interface PrototypeCliBaseOptions {
  /** Output machine-readable JSON to stdout. */
  json?: boolean;
  /** Override author email attributed to writes. */
  modifiedBy?: string;
  /** Optional pre-loaded `RootConfig` (used in integration tests). */
  rootConfig?: RootConfig;
}

/** Options for `prototypes.list`. */
export interface PrototypesListOptions extends PrototypeCliBaseOptions {
  /** Filter by board status: `active`, `archived`, or `all`. */
  status?: string;
}

/** Options for `prototypes.get`. */
export interface PrototypesGetOptions extends PrototypeCliBaseOptions {}

/** Options for `prototypes.create`. */
export interface PrototypesCreateOptions extends PrototypeCliBaseOptions {
  /** Human-readable board title. */
  title?: string;
  /** Optional board description shown on `/cms/prototypes`. */
  description?: string;
  /** Initial page display name (default: `"Page 1"`). */
  page?: string;
  /** Allow updating metadata if `boardId` already exists. */
  upsert?: boolean;
}

/** Options for `prototypes.update`. */
export interface PrototypesUpdateOptions extends PrototypeCliBaseOptions {
  /** Updated board title. */
  title?: string;
  /** Updated board description. */
  description?: string;
  /** Updated board status (`active` or `archived`). */
  status?: string;
  /** JSON string or path to `.json` file containing `PrototypeTheme` fields. */
  theme?: string;
  /** Appends a new page with the given display name. */
  addPage?: string;
  /** Renames an existing page (`<pageId>:<newName>`). */
  renamePage?: string;
}

/** Options for `prototypes.delete`. */
export interface PrototypesDeleteOptions extends PrototypeCliBaseOptions {}

/** Options for `prototypes.frame.set`. */
export interface PrototypesFrameSetOptions extends PrototypeCliBaseOptions {
  /** Display title for the frame. */
  title?: string;
  /** Target `pageId` on the board (defaults to existing or first board page). */
  page?: string;
  /** Frame viewport width in px (e.g. `1440`, `768`, `390`). */
  width?: string;
  /** Explicit world X coordinate. Auto-placed side-by-side when creating if omitted. */
  x?: string;
  /** Explicit world Y coordinate. */
  y?: string;
  /** Force treating input payload as HTML markup rather than JSON. */
  html?: boolean;
  /** Optional companion CSS file path applied to a single-block HTML upload. */
  css?: string;
  /** Default component identifier when uploading plain HTML without `@block` markers. */
  component?: string;
  /** Default block label when uploading plain HTML without `@block` markers. */
  label?: string;
  /** Marks a plain HTML upload block as a proposed net-new component. */
  proposed?: boolean;
}

/** Options for `prototypes.frame.delete`. */
export interface PrototypesFrameDeleteOptions extends PrototypeCliBaseOptions {}

/** Options for `prototypes.comments`. */
export interface PrototypesCommentsOptions extends PrototypeCliBaseOptions {
  /** Filter comments to a specific `pageId`. */
  page?: string;
  /** Filter comments to a specific `frameId`. */
  frame?: string;
  /** Include resolved threads (defaults to open threads only). */
  all?: boolean;
  /** Resolve the specified `threadId`. */
  resolve?: string;
}

/** Firestore collection/doc references for a project's Prototypes namespace. */
function getPrototypeRefs(db: Firestore, projectId: string) {
  const projectDoc = db.doc(`Projects/${projectId}`);
  const boardsCol = projectDoc.collection('Prototypes');
  const projectComponentsCol = projectDoc.collection('PrototypeComponents');
  return {
    boardsCol,
    projectComponentsCol,
    boardDoc: (boardId: string) => boardsCol.doc(boardId),
    framesCol: (boardId: string) => boardsCol.doc(boardId).collection('Frames'),
    componentsCol: (boardId: string) =>
      boardsCol.doc(boardId).collection('Components'),
    commentsCol: (boardId: string) =>
      boardsCol.doc(boardId).collection('Comments'),
    annotationsCol: (boardId: string) =>
      boardsCol.doc(boardId).collection('Annotations'),
    // Legacy: AI turn snapshots are no longer written; only used for cleanup.
    turnsCol: (boardId: string) => boardsCol.doc(boardId).collection('Turns'),
  };
}

/** Loads `RootConfig` and initializes `RootCMSClient` for CLI operations. */
async function resolveCliContext(options?: PrototypeCliBaseOptions) {
  const rootConfig =
    options?.rootConfig ||
    (await loadRootConfig(process.cwd(), {command: 'root-cms'}));
  const cmsClient = new RootCMSClient(rootConfig);
  const cmsPlugin = getCmsPlugin(rootConfig);
  const cmsConfig = cmsPlugin.getConfig();
  const userEmail =
    options?.modifiedBy?.trim() || getCliUser() || 'cli@root-cms';
  return {
    rootConfig,
    cmsConfig,
    cmsClient,
    db: cmsClient.db,
    projectId: cmsClient.projectId,
    refs: getPrototypeRefs(cmsClient.db, cmsClient.projectId),
    userEmail,
  };
}

/** Validates a safe Firestore document identifier. */
function assertValidDocId(id: string, kind: string): string {
  const trimmed = String(id || '').trim();
  if (!SAFE_DOC_ID_RE.test(trimmed)) {
    throw new Error(
      `invalid ${kind} "${id}" (use letters, numbers, hyphens, or underscores)`
    );
  }
  return trimmed;
}

/** Generates a URL-safe slug identifier with a short random suffix. */
function generateSlugId(label: string, fallbackPrefix = 'proto'): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const rand = crypto.randomBytes(3).toString('hex');
  return slug ? `${slug}-${rand}` : `${fallbackPrefix}-${rand}`;
}

/** Converts a display title into a humanized fallback title. */
function humanizeSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Recursively strips `undefined` properties before writing to Firestore. */
function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

/** Reads UTF-8 text from stdin until EOF. */
function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on('end', () =>
      resolve(Buffer.concat(chunks).toString('utf8'))
    );
    process.stdin.on('error', reject);
  });
}

/** Sorts frames deterministically by `sortOrder` then `createdAt`. */
function sortFrames(frames: PrototypeFrame[]): PrototypeFrame[] {
  return [...frames].sort((a, b) => {
    if (a.sortOrder && b.sortOrder && a.sortOrder !== b.sortOrder) {
      return a.sortOrder < b.sortOrder ? -1 : 1;
    }
    return (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id);
  });
}

/** Builds a `PrototypeBoardSummary` from board, frames, and comments. */
function buildBoardSummary(
  board: PrototypeBoard,
  frames: PrototypeFrame[],
  comments: PrototypeCommentThread[]
): PrototypeBoardSummary {
  const pageFrameCounts: Record<string, number> = {};
  for (const page of board.pages || []) {
    pageFrameCounts[page.id] = 0;
  }
  for (const frame of frames) {
    const pid = frame.pageId || 'page-1';
    pageFrameCounts[pid] = (pageFrameCounts[pid] || 0) + 1;
  }
  const openCommentCount = comments.filter((c) => c.status === 'open').length;
  const sorted = sortFrames(frames);
  const previewFrames = sorted.slice(0, 3).map((frame) => ({
    id: frame.id,
    title: frame.title,
    width: frame.width,
    blockLabels: getOrderedBlocks(frame.blocks)
      .slice(0, 6)
      .map(({block}) => ({
        label: block.label,
        ...(block.proposed ? {proposed: true} : {}),
      })),
  }));
  return {
    ...board,
    frameCount: frames.length,
    pageFrameCounts,
    openCommentCount,
    ...(previewFrames.length > 0 ? {previewFrames} : {}),
  };
}

/** Computes a non-overlapping `(x, y)` coordinate to the right of existing frames on `pageId`. */
function computeNextFramePosition(
  existingFrames: PrototypeFrame[],
  pageId: string
): {x: number; y: number} {
  const pageFrames = existingFrames.filter((f) => f.pageId === pageId);
  if (pageFrames.length === 0) {
    return {x: DEFAULT_FRAME_START_X, y: DEFAULT_FRAME_START_Y};
  }
  let maxRight = -Infinity;
  let baselineY = pageFrames[0].y;
  for (const f of pageFrames) {
    const right = f.x + f.width;
    if (right > maxRight) {
      maxRight = right;
      baselineY = f.y;
    }
  }
  return {
    x: Math.round(maxRight + FRAME_AUTO_GAP_X),
    y: Math.round(baselineY),
  };
}

/**
 * Parses an HTML document into a `PrototypeBlockMap`.
 *
 * Supports optional `<!-- @block key="hero" component="Hero" label="Hero" proposed="true" -->`
 * section delimiters so multi-section HTML files split cleanly into selectable,
 * commentable CMS blocks and round-trip losslessly with `prototypes.get`.
 * Plain HTML files without `@block` comments become a single `'main'` block.
 */
export function parseHtmlIntoBlocks(
  rawHtml: string,
  defaults: {
    component?: string;
    label?: string;
    proposed?: boolean;
    css?: string;
  } = {}
): PrototypeBlockMap {
  const markerRe = /<!--\s*@block\b([\s\S]*?)-->/gi;
  const matches = Array.from(rawHtml.matchAll(markerRe));

  if (matches.length === 0) {
    const block: PrototypeBlock = {
      component: (defaults.component || 'PageMock').trim(),
      label: (defaults.label || 'Page layout').trim(),
      html: sanitizePrototypeHtml(rawHtml),
    };
    if (defaults.proposed) {
      block.proposed = true;
    }
    if (defaults.css) {
      const cleanedCss = sanitizePrototypeCss(defaults.css);
      if (cleanedCss) {
        block.css = cleanedCss;
      }
    }
    return {_array: ['main'], main: block};
  }

  const parseAttrs = (attrText: string): Record<string, string> => {
    const attrs: Record<string, string> = {};
    const attrRe = /([a-zA-Z0-9_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(attrText)) !== null) {
      const key = m[1].toLowerCase();
      const val = (m[2] ?? m[3] ?? m[4] ?? 'true').replace(/&quot;/g, '"');
      attrs[key] = val;
    }
    return attrs;
  };

  const map: PrototypeBlockMap = {_array: []};
  const usedKeys = new Set<string>();

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const startIdx = (current.index ?? 0) + current[0].length;
    const endIdx =
      i + 1 < matches.length
        ? (matches[i + 1].index ?? rawHtml.length)
        : rawHtml.length;
    const sectionHtml = rawHtml.slice(startIdx, endIdx).trim();
    if (!sectionHtml) {
      continue;
    }
    const attrs = parseAttrs(current[1] || '');
    const rawKey = (attrs.key || attrs.id || `block-${i + 1}`)
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    let key = rawKey || `block-${i + 1}`;
    let suffix = 2;
    while (key === '_array' || usedKeys.has(key)) {
      key = `${rawKey || 'block'}-${suffix++}`;
    }
    usedKeys.add(key);

    const component = (attrs.component || defaults.component || 'SectionBlock')
      .trim()
      .slice(0, 120);
    const label = (attrs.label || component).trim().slice(0, 160);
    const proposed =
      attrs.proposed === 'true' ||
      attrs.proposed === '1' ||
      Boolean(defaults.proposed && attrs.proposed === undefined);

    const block: PrototypeBlock = {
      component,
      label,
      html: sanitizePrototypeHtml(sectionHtml),
    };
    if (proposed) {
      block.proposed = true;
    }
    map._array.push(key);
    map[key] = block;
  }

  if (defaults.css && map._array.length > 0) {
    const firstKey = map._array[0];
    const firstBlock = map[firstKey] as PrototypeBlock;
    const cleanedCss = sanitizePrototypeCss(defaults.css);
    if (cleanedCss) {
      firstBlock.css = cleanedCss;
    }
  }

  return map;
}

/** Serializes a `PrototypeFrame`'s ordered blocks into round-trippable `@block`-annotated HTML. */
export function serializeFrameBlocksToHtml(frame: PrototypeFrame): string {
  const ordered = getOrderedBlocks(frame.blocks);
  if (ordered.length === 0) {
    return '';
  }
  return (
    ordered
      .map(({key, block}) => {
        const esc = (s: string) => s.replace(/"/g, '&quot;');
        const attrs = [
          `key="${esc(key)}"`,
          `component="${esc(block.component)}"`,
          `label="${esc(block.label)}"`,
          block.proposed ? 'proposed="true"' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return `<!-- @block ${attrs} -->\n${block.html}`;
      })
      .join('\n\n') + '\n'
  );
}

/** Normalizes either a `PrototypeBlockMap` or an array of block objects into a sanitized `PrototypeBlockMap`. */
function normalizeJsonBlocksInput(rawBlocks: unknown): PrototypeBlockMap {
  if (Array.isArray(rawBlocks)) {
    const map: PrototypeBlockMap = {_array: []};
    const seen = new Set<string>();
    rawBlocks.forEach((entry, idx) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const obj = entry as Record<string, unknown>;
      const baseKey = String(obj.key || `block-${idx + 1}`)
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '-');
      let key = baseKey || `block-${idx + 1}`;
      let n = 2;
      while (key === '_array' || seen.has(key)) {
        key = `${baseKey || 'block'}-${n++}`;
      }
      seen.add(key);
      const component = String(obj.component || 'Block')
        .trim()
        .slice(0, 120);
      const label = String(obj.label || component)
        .trim()
        .slice(0, 160);
      const block: PrototypeBlock = {
        component,
        label,
        html: sanitizePrototypeHtml(String(obj.html || '')),
      };
      if (obj.proposed === true) {
        block.proposed = true;
      }
      if (typeof obj.css === 'string' && obj.css.trim()) {
        const cleanedCss = sanitizePrototypeCss(obj.css);
        if (cleanedCss) {
          block.css = cleanedCss;
        }
      }
      map._array.push(key);
      map[key] = block;
    });
    return map;
  }

  if (rawBlocks && typeof rawBlocks === 'object') {
    const rec = rawBlocks as Record<string, unknown>;
    const rawArray = Array.isArray(rec._array)
      ? rec._array.filter((k): k is string => typeof k === 'string')
      : Object.keys(rec).filter((k) => k !== '_array');
    const map: PrototypeBlockMap = {_array: []};
    const seen = new Set<string>();
    for (const key of rawArray) {
      if (!key || key === '_array' || seen.has(key)) {
        continue;
      }
      const val = rec[key];
      if (!val || typeof val !== 'object' || Array.isArray(val)) {
        continue;
      }
      const obj = val as Record<string, unknown>;
      const component = String(obj.component || 'Block')
        .trim()
        .slice(0, 120);
      const label = String(obj.label || component)
        .trim()
        .slice(0, 160);
      const block: PrototypeBlock = {
        component,
        label,
        html: sanitizePrototypeHtml(String(obj.html || '')),
      };
      if (obj.proposed === true) {
        block.proposed = true;
      }
      if (typeof obj.css === 'string' && obj.css.trim()) {
        const cleanedCss = sanitizePrototypeCss(obj.css);
        if (cleanedCss) {
          block.css = cleanedCss;
        }
      }
      seen.add(key);
      map._array.push(key);
      map[key] = block;
    }
    return map;
  }

  return {_array: []};
}

/** Sanitizes a `PrototypeTheme` input object. */
function sanitizeThemeInput(raw: unknown): PrototypeTheme {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const obj = raw as Record<string, unknown>;
  const stringKeys = [
    'fontSans',
    'fontHeading',
    'fontMono',
    'colorBg',
    'colorSurface',
    'colorFg',
    'colorMuted',
    'colorPrimary',
    'colorOnPrimary',
    'colorBorder',
    'radius',
    'containerMaxWidth',
  ] as const;
  const theme: PrototypeTheme = {};
  for (const key of stringKeys) {
    const val = obj[key];
    if (typeof val === 'string' && val.trim()) {
      theme[key] = val.trim().slice(0, 300);
    }
  }
  if (Array.isArray(obj.fontUrls)) {
    const urls = obj.fontUrls
      .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
      .map((u) => u.trim())
      .slice(0, 8);
    if (urls.length > 0) {
      theme.fontUrls = urls;
    }
  }
  return theme;
}

/** Deletes all documents in a collection in chunked batches. */
async function deleteCollectionDocs(
  db: Firestore,
  col: CollectionReference
): Promise<void> {
  const snap = await col.select().get();
  const refs: DocumentReference[] = snap.docs.map((d) => d.ref);
  for (let i = 0; i < refs.length; i += MAX_BATCH_OPS) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + MAX_BATCH_OPS)) {
      batch.delete(ref);
    }
    await batch.commit();
  }
}

/**
 * Lists prototype boards in the project.
 *
 * Usage:
 *   root-cms prototypes.list [--status active|archived|all] [--json]
 */
export async function prototypesList(
  options: PrototypesListOptions = {}
): Promise<PrototypeBoardSummary[]> {
  const {refs} = await resolveCliContext(options);
  const statusFilter = (options.status || 'active').toLowerCase();
  if (!['active', 'archived', 'all'].includes(statusFilter)) {
    throw new Error(
      `invalid --status "${options.status}" (expected "active", "archived", or "all")`
    );
  }

  const snap = await refs.boardsCol.get();
  let boards = snap.docs.map((doc) => ({
    ...(doc.data() as PrototypeBoard),
    id: doc.id,
  }));
  if (statusFilter === 'active' || statusFilter === 'archived') {
    boards = boards.filter((b) => b.status === statusFilter);
  }

  const summaries = await Promise.all(
    boards.map(async (board) => {
      const [framesSnap, commentsSnap] = await Promise.all([
        refs.framesCol(board.id).get(),
        refs.commentsCol(board.id).get(),
      ]);
      const frames = framesSnap.docs.map((d) => ({
        ...(d.data() as PrototypeFrame),
        id: d.id,
      }));
      const comments = commentsSnap.docs.map((d) => ({
        ...(d.data() as PrototypeCommentThread),
        id: d.id,
      }));
      return buildBoardSummary(board, frames, comments);
    })
  );
  summaries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  if (options.json) {
    process.stdout.write(JSON.stringify(summaries, null, 2) + '\n');
    return summaries;
  }

  if (summaries.length === 0) {
    console.log(
      `No ${statusFilter === 'all' ? '' : `${statusFilter} `}prototypes found.`
    );
    return summaries;
  }

  for (const b of summaries) {
    const framesLabel = `${b.frameCount} ${b.frameCount === 1 ? 'frame' : 'frames'}`;
    const commentsLabel =
      b.openCommentCount > 0 ? `  ${b.openCommentCount} open comments` : '';
    console.log(
      `${b.id}  ${b.title}  ${dim(`(${b.status}, ${framesLabel}${commentsLabel})`)}  ${dim(`/cms/prototypes/${b.id}`)}`
    );
  }
  return summaries;
}

/**
 * Fetches a prototype board bundle as JSON, or exports it to `outputDir` with
 * editable `.html` + `.json` frame files.
 *
 * Usage:
 *   root-cms prototypes.get <boardId> [outputDir] [--json]
 */
export async function prototypesGet(
  boardIdArg: string,
  outputDirArg?: string,
  options: PrototypesGetOptions = {}
): Promise<PrototypeBoardBundle> {
  const boardId = assertValidDocId(boardIdArg, 'boardId');
  const {refs} = await resolveCliContext(options);
  const boardSnap = await refs.boardDoc(boardId).get();
  if (!boardSnap.exists) {
    throw new Error(`prototype board not found: ${boardId}`);
  }
  const board: PrototypeBoard = {
    ...(boardSnap.data() as PrototypeBoard),
    id: boardSnap.id,
  };

  const [
    framesSnap,
    boardComponentsSnap,
    projectComponentsSnap,
    commentsSnap,
    annotationsSnap,
  ] = await Promise.all([
    refs.framesCol(boardId).get(),
    refs.componentsCol(boardId).get(),
    refs.projectComponentsCol.get(),
    refs.commentsCol(boardId).get(),
    refs.annotationsCol(boardId).get(),
  ]);

  const frames = sortFrames(
    framesSnap.docs.map((d) => ({
      ...(d.data() as PrototypeFrame),
      id: d.id,
    }))
  );
  const components: Record<string, PrototypeComponentSpec> = {};
  for (const d of projectComponentsSnap.docs) {
    const spec = d.data() as PrototypeComponentSpec;
    components[spec.name || d.id] = {...spec, name: spec.name || d.id};
  }
  for (const d of boardComponentsSnap.docs) {
    const spec = d.data() as PrototypeComponentSpec;
    components[spec.name || d.id] = {...spec, name: spec.name || d.id};
  }
  const comments = commentsSnap.docs
    .map((d) => ({...(d.data() as PrototypeCommentThread), id: d.id}))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  const annotations = annotationsSnap.docs
    .map((d) => ({...(d.data() as PrototypeAnnotation), id: d.id}))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  const bundle: PrototypeBoardBundle = {
    board,
    frames,
    components,
    comments,
    annotations,
  };

  if (outputDirArg) {
    const outDir = path.resolve(outputDirArg);
    const framesDir = path.join(outDir, 'frames');
    fs.mkdirSync(framesDir, {recursive: true});
    fs.writeFileSync(
      path.join(outDir, 'board.json'),
      JSON.stringify(board, null, 2) + '\n'
    );
    fs.writeFileSync(
      path.join(outDir, 'comments.json'),
      JSON.stringify(comments, null, 2) + '\n'
    );
    fs.writeFileSync(
      path.join(outDir, 'annotations.json'),
      JSON.stringify(annotations, null, 2) + '\n'
    );
    for (const frame of frames) {
      fs.writeFileSync(
        path.join(framesDir, `${frame.id}.json`),
        JSON.stringify(frame, null, 2) + '\n'
      );
      fs.writeFileSync(
        path.join(framesDir, `${frame.id}.html`),
        serializeFrameBlocksToHtml(frame)
      );
    }
    if (!options.json) {
      console.error(
        `Exported prototype "${board.title}" (${frames.length} frames, ${comments.length} comment threads) to ${outDir}`
      );
    } else {
      process.stdout.write(JSON.stringify(bundle, null, 2) + '\n');
    }
    return bundle;
  }

  process.stdout.write(JSON.stringify(bundle, null, 2) + '\n');
  return bundle;
}

/**
 * Creates a new prototype board (extracting default brand theme tokens from
 * the local project's `styles/` automatically).
 *
 * Usage:
 *   root-cms prototypes.create [boardId] --title "Pricing Refresh" [--description "..."] [--json]
 */
export async function prototypesCreate(
  boardIdArg?: string,
  options: PrototypesCreateOptions = {}
): Promise<PrototypeBoard> {
  const {rootConfig, cmsConfig, refs, userEmail} =
    await resolveCliContext(options);

  const explicitId = boardIdArg ? assertValidDocId(boardIdArg, 'boardId') : '';
  const title = (
    options.title?.trim() || (explicitId ? humanizeSlug(explicitId) : '')
  ).slice(0, 200);
  if (!title) {
    throw new Error(
      'missing --title (pass --title "<title>" or provide a <boardId> slug)'
    );
  }

  const boardId = explicitId || generateSlugId(title);
  const docRef = refs.boardDoc(boardId);
  const existingSnap = await docRef.get();
  if (existingSnap.exists && !options.upsert) {
    throw new Error(
      `prototype board "${boardId}" already exists (pass --upsert to update it)`
    );
  }

  let defaultTheme: PrototypeTheme = {};
  try {
    const ctx = await loadPrototypeProjectContext({rootConfig, cmsConfig});
    defaultTheme = ctx.defaultTheme || {};
  } catch {
    // Fall back to empty theme if styles cannot be scanned.
  }

  const now = Date.now();
  const existing = existingSnap.exists
    ? (existingSnap.data() as PrototypeBoard)
    : null;
  const pageName = options.page?.trim() || DEFAULT_PROTOTYPE_PAGES[0].name;
  const pages: PrototypeBoardPage[] = existing?.pages?.length
    ? existing.pages
    : [{id: 'page-1', name: pageName.slice(0, 80)}];

  const board: PrototypeBoard = {
    id: boardId,
    title,
    ...(options.description?.trim()
      ? {description: options.description.trim().slice(0, 1000)}
      : existing?.description
        ? {description: existing.description}
        : {}),
    status: existing?.status || 'active',
    pages,
    theme:
      existing?.theme && Object.keys(existing.theme).length > 0
        ? existing.theme
        : defaultTheme,
    ...(existing?.aiChatId ? {aiChatId: existing.aiChatId} : {}),
    createdAt: existing?.createdAt ?? now,
    createdBy: existing?.createdBy ?? userEmail,
    updatedAt: now,
    updatedBy: userEmail,
  };

  await docRef.set(stripUndefinedDeep(board));

  if (options.json) {
    process.stdout.write(JSON.stringify(board, null, 2) + '\n');
  } else {
    console.log(
      `${green('✔')} Created prototype board ${board.id} ("${board.title}") -> /cms/prototypes/${board.id}`
    );
  }
  return board;
}

/**
 * Updates prototype board metadata, status, pages, or theme tokens.
 *
 * Usage:
 *   root-cms prototypes.update <boardId> [--title "..."] [--status active|archived] [--theme ./theme.json] [--add-page "Mobile"] [--rename-page "page-1:Desktop"]
 */
export async function prototypesUpdate(
  boardIdArg: string,
  options: PrototypesUpdateOptions = {}
): Promise<PrototypeBoard> {
  const boardId = assertValidDocId(boardIdArg, 'boardId');
  const {refs, userEmail} = await resolveCliContext(options);
  const docRef = refs.boardDoc(boardId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new Error(`prototype board not found: ${boardId}`);
  }

  const updated: PrototypeBoard = {
    ...(snap.data() as PrototypeBoard),
    id: snap.id,
  };

  if (options.title !== undefined) {
    const nextTitle = options.title.trim();
    if (!nextTitle) {
      throw new Error('--title cannot be empty');
    }
    updated.title = nextTitle.slice(0, 200);
  }

  if (options.description !== undefined) {
    const nextDesc = options.description.trim();
    if (nextDesc) {
      updated.description = nextDesc.slice(0, 1000);
    } else {
      delete updated.description;
    }
  }

  if (options.status !== undefined) {
    const nextStatus = options.status
      .trim()
      .toLowerCase() as PrototypeBoardStatus;
    if (nextStatus !== 'active' && nextStatus !== 'archived') {
      throw new Error(
        `invalid --status "${options.status}" (expected "active" or "archived")`
      );
    }
    updated.status = nextStatus;
  }

  if (options.theme !== undefined) {
    const rawThemeArg = options.theme.trim();
    const themeJsonText =
      rawThemeArg.startsWith('{') || !fs.existsSync(path.resolve(rawThemeArg))
        ? rawThemeArg
        : fs.readFileSync(path.resolve(rawThemeArg), 'utf8');
    updated.theme = {
      ...updated.theme,
      ...sanitizeThemeInput(JSON.parse(themeJsonText)),
    };
  }

  if (options.addPage !== undefined) {
    const name = options.addPage.trim().slice(0, 80);
    if (!name) {
      throw new Error('--add-page cannot be empty');
    }
    const taken = new Set((updated.pages || []).map((p) => p.id));
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'page';
    let id = base;
    let suffix = 2;
    while (taken.has(id)) {
      id = `${base}-${suffix++}`;
    }
    updated.pages = [...(updated.pages || []), {id, name}];
  }

  if (options.renamePage !== undefined) {
    const sepIdx = options.renamePage.indexOf(':');
    if (sepIdx <= 0) {
      throw new Error(
        'invalid --rename-page format (expected "<pageId>:<newName>")'
      );
    }
    const targetPageId = options.renamePage.slice(0, sepIdx).trim();
    const newName = options.renamePage
      .slice(sepIdx + 1)
      .trim()
      .slice(0, 80);
    if (!newName) {
      throw new Error('--rename-page new name cannot be empty');
    }
    const exists = (updated.pages || []).some((p) => p.id === targetPageId);
    if (!exists) {
      throw new Error(`page "${targetPageId}" not found on board "${boardId}"`);
    }
    updated.pages = (updated.pages || []).map((p) =>
      p.id === targetPageId ? {...p, name: newName} : p
    );
  }

  updated.updatedAt = Date.now();
  updated.updatedBy = userEmail;
  await docRef.set(stripUndefinedDeep(updated));

  if (options.json) {
    process.stdout.write(JSON.stringify(updated, null, 2) + '\n');
  } else {
    console.log(`${green('✔')} Updated prototype board ${boardId}`);
  }
  return updated;
}

/**
 * Permanently deletes a prototype board and all of its subcollections.
 *
 * Usage:
 *   root-cms prototypes.delete <boardId> [--json]
 */
export async function prototypesDelete(
  boardIdArg: string,
  options: PrototypesDeleteOptions = {}
): Promise<void> {
  const boardId = assertValidDocId(boardIdArg, 'boardId');
  const {db, refs} = await resolveCliContext(options);
  const boardRef = refs.boardDoc(boardId);
  const snap = await boardRef.get();
  if (!snap.exists) {
    throw new Error(`prototype board not found: ${boardId}`);
  }

  await Promise.all([
    deleteCollectionDocs(db, refs.framesCol(boardId)),
    deleteCollectionDocs(db, refs.componentsCol(boardId)),
    deleteCollectionDocs(db, refs.commentsCol(boardId)),
    deleteCollectionDocs(db, refs.annotationsCol(boardId)),
    // Legacy cleanup for boards created before turn snapshots were removed.
    deleteCollectionDocs(db, refs.turnsCol(boardId)),
  ]);
  await boardRef.delete();

  if (options.json) {
    process.stdout.write(
      JSON.stringify({deleted: true, boardId}, null, 2) + '\n'
    );
  } else {
    console.log(`${green('✔')} Deleted prototype board ${boardId}`);
  }
}

/**
 * Creates or updates a single artboard frame on a prototype board from an
 * `.html` file, `.json` file, or stdin (`-`).
 *
 * Usage:
 *   root-cms prototypes.frame.set <boardId> <frameId> [filepath] [--title "..."] [--width 1440] [--page page-1] [--html]
 */
export async function prototypesFrameSet(
  boardIdArg: string,
  frameIdArg: string,
  filepathArg?: string,
  options: PrototypesFrameSetOptions = {}
): Promise<PrototypeFrame> {
  const boardId = assertValidDocId(boardIdArg, 'boardId');
  const frameId = assertValidDocId(frameIdArg, 'frameId');
  const {db, refs, userEmail} = await resolveCliContext(options);

  const boardRef = refs.boardDoc(boardId);
  const frameRef = refs.framesCol(boardId).doc(frameId);
  const [boardSnap, existingFrameSnap, allFramesSnap] = await Promise.all([
    boardRef.get(),
    frameRef.get(),
    refs.framesCol(boardId).get(),
  ]);
  if (!boardSnap.exists) {
    throw new Error(
      `prototype board "${boardId}" not found (create it first with \`root-cms prototypes.create ${boardId} --title "..."\`)`
    );
  }
  const board = {...(boardSnap.data() as PrototypeBoard), id: boardSnap.id};
  const existingFrame = existingFrameSnap.exists
    ? ({
        ...(existingFrameSnap.data() as PrototypeFrame),
        id: frameId,
      } as PrototypeFrame)
    : null;
  const allFrames = allFramesSnap.docs.map((d) => ({
    ...(d.data() as PrototypeFrame),
    id: d.id,
  }));

  let payloadText: string;
  let isHtmlInput = Boolean(options.html);
  if (filepathArg && filepathArg !== '-') {
    const resolvedPath = path.resolve(filepathArg);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`file not found: ${resolvedPath}`);
    }
    payloadText = fs.readFileSync(resolvedPath, 'utf8');
    if (/\.html?$/i.test(resolvedPath)) {
      isHtmlInput = true;
    }
  } else {
    payloadText = await readStdin();
    if (!isHtmlInput && payloadText.trimStart().startsWith('<')) {
      isHtmlInput = true;
    }
  }

  const companionCss = options.css
    ? fs.readFileSync(path.resolve(options.css), 'utf8')
    : undefined;

  let jsonInput: Record<string, unknown> = {};
  let blocks: PrototypeBlockMap;

  if (isHtmlInput) {
    blocks = parseHtmlIntoBlocks(payloadText, {
      component: options.component,
      label:
        options.label ||
        options.title ||
        existingFrame?.title ||
        humanizeSlug(frameId),
      proposed: options.proposed,
      css: companionCss,
    });
  } else {
    const parsed = JSON.parse(payloadText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('expected JSON object for frame payload');
    }
    jsonInput = parsed as Record<string, unknown>;
    if (typeof jsonInput.html === 'string' && jsonInput.blocks === undefined) {
      blocks = parseHtmlIntoBlocks(jsonInput.html, {
        component:
          options.component || (jsonInput.component as string | undefined),
        label:
          options.label ||
          (jsonInput.label as string | undefined) ||
          options.title ||
          (jsonInput.title as string | undefined) ||
          humanizeSlug(frameId),
        proposed: options.proposed ?? Boolean(jsonInput.proposed),
        css: companionCss || (jsonInput.css as string | undefined),
      });
    } else if (jsonInput.blocks !== undefined) {
      blocks = normalizeJsonBlocksInput(jsonInput.blocks);
    } else {
      blocks = existingFrame?.blocks || {_array: []};
    }
  }

  const defaultPageId = board.pages?.[0]?.id || 'page-1';
  const pageId = (
    options.page?.trim() ||
    (typeof jsonInput.pageId === 'string' ? jsonInput.pageId.trim() : '') ||
    existingFrame?.pageId ||
    defaultPageId
  ).slice(0, 64);

  const rawWidth =
    options.width !== undefined
      ? Number(options.width)
      : typeof jsonInput.width === 'number'
        ? jsonInput.width
        : (existingFrame?.width ?? 1440);
  if (!Number.isFinite(rawWidth) || rawWidth <= 0) {
    throw new Error(`invalid --width: ${options.width}`);
  }
  const width = Math.max(240, Math.min(2560, Math.round(rawWidth)));

  const autoPos = existingFrame
    ? {x: existingFrame.x, y: existingFrame.y}
    : computeNextFramePosition(allFrames, pageId);

  for (const axis of ['x', 'y'] as const) {
    if (
      options[axis] !== undefined &&
      !Number.isFinite(Number(options[axis]))
    ) {
      throw new Error(`--${axis} must be a number, got "${options[axis]}".`);
    }
  }
  const x =
    options.x !== undefined
      ? Math.round(Number(options.x))
      : typeof jsonInput.x === 'number' && Number.isFinite(jsonInput.x)
        ? Math.round(jsonInput.x)
        : autoPos.x;
  const y =
    options.y !== undefined
      ? Math.round(Number(options.y))
      : typeof jsonInput.y === 'number' && Number.isFinite(jsonInput.y)
        ? Math.round(jsonInput.y)
        : autoPos.y;

  const title = (
    options.title?.trim() ||
    (typeof jsonInput.title === 'string' ? jsonInput.title.trim() : '') ||
    existingFrame?.title ||
    humanizeSlug(frameId)
  ).slice(0, 160);

  const now = Date.now();
  const savedFrame: PrototypeFrame = {
    id: frameId,
    boardId,
    pageId,
    title,
    width,
    x,
    y,
    blocks,
    ...(existingFrame?.cachedHeight
      ? {cachedHeight: existingFrame.cachedHeight}
      : {}),
    ...(existingFrame?.sortOrder ? {sortOrder: existingFrame.sortOrder} : {}),
    createdAt: existingFrame?.createdAt ?? now,
    createdBy: existingFrame?.createdBy ?? userEmail,
    updatedAt: now,
    updatedBy: userEmail,
  };

  // Ensure the target page exists on the board if a new pageId was specified.
  const pageExists = (board.pages || []).some((p) => p.id === pageId);
  const nextPages = pageExists
    ? board.pages
    : [...(board.pages || []), {id: pageId, name: humanizeSlug(pageId)}];

  const batch = db.batch();
  batch.set(frameRef, stripUndefinedDeep(savedFrame));
  batch.update(boardRef, {
    pages: nextPages,
    updatedAt: now,
    updatedBy: userEmail,
  });
  await batch.commit();

  if (options.json) {
    process.stdout.write(JSON.stringify(savedFrame, null, 2) + '\n');
  } else {
    const blockCount = savedFrame.blocks._array.length;
    console.log(
      `${green('✔')} Saved frame ${frameId} ("${savedFrame.title}", ${savedFrame.width}px, ${blockCount} ${blockCount === 1 ? 'block' : 'blocks'}) on /cms/prototypes/${boardId}`
    );
  }
  return savedFrame;
}

/**
 * Deletes a single frame from a prototype board.
 *
 * Usage:
 *   root-cms prototypes.frame.delete <boardId> <frameId> [--json]
 */
export async function prototypesFrameDelete(
  boardIdArg: string,
  frameIdArg: string,
  options: PrototypesFrameDeleteOptions = {}
): Promise<void> {
  const boardId = assertValidDocId(boardIdArg, 'boardId');
  const frameId = assertValidDocId(frameIdArg, 'frameId');
  const {db, refs, userEmail} = await resolveCliContext(options);

  const boardRef = refs.boardDoc(boardId);
  const boardSnap = await boardRef.get();
  if (!boardSnap.exists) {
    throw new Error(`prototype board not found: ${boardId}`);
  }

  const now = Date.now();
  const batch = db.batch();
  batch.delete(refs.framesCol(boardId).doc(frameId));
  batch.update(boardRef, {updatedAt: now, updatedBy: userEmail});
  await batch.commit();

  if (options.json) {
    process.stdout.write(
      JSON.stringify({deleted: true, boardId, frameId}, null, 2) + '\n'
    );
  } else {
    console.log(`${green('✔')} Deleted frame ${frameId} from ${boardId}`);
  }
}

/**
 * Lists or resolves comment threads on a prototype board so local AI coding
 * agents can inspect reviewer feedback and iterate on frames.
 *
 * Usage:
 *   root-cms prototypes.comments <boardId> [--page <id>] [--frame <id>] [--all] [--resolve <threadId>] [--json]
 */
export async function prototypesComments(
  boardIdArg: string,
  options: PrototypesCommentsOptions = {}
): Promise<PrototypeCommentThread[]> {
  const boardId = assertValidDocId(boardIdArg, 'boardId');
  const {refs, userEmail} = await resolveCliContext(options);

  const boardSnap = await refs.boardDoc(boardId).get();
  if (!boardSnap.exists) {
    throw new Error(`prototype board not found: ${boardId}`);
  }

  if (options.resolve) {
    const threadId = assertValidDocId(options.resolve, 'threadId');
    const threadRef = refs.commentsCol(boardId).doc(threadId);
    const threadSnap = await threadRef.get();
    if (!threadSnap.exists) {
      throw new Error(`comment thread not found: ${threadId}`);
    }
    const existing = {
      ...(threadSnap.data() as PrototypeCommentThread),
      id: threadSnap.id,
    };
    const now = Date.now();
    const resolvedItem: PrototypeCommentItem = {
      id: generateSlugId('c'),
      type: 'resolved',
      createdAt: now,
      createdBy: userEmail,
    };
    const updated: PrototypeCommentThread = {
      ...existing,
      status: 'resolved',
      comments: [...(existing.comments || []), resolvedItem],
      participants: Array.from(
        new Set([...(existing.participants || []), userEmail])
      ),
      resolvedAt: now,
      resolvedBy: userEmail,
      updatedAt: now,
      updatedBy: userEmail,
    };
    await threadRef.set(stripUndefinedDeep(updated));
    if (options.json) {
      process.stdout.write(JSON.stringify(updated, null, 2) + '\n');
    } else {
      console.log(`${green('✔')} Resolved comment thread ${threadId}`);
    }
    return [updated];
  }

  const snap = await refs.commentsCol(boardId).get();
  let threads = snap.docs
    .map((d) => ({...(d.data() as PrototypeCommentThread), id: d.id}))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  if (!options.all) {
    threads = threads.filter((t) => t.status === 'open');
  }
  if (options.page) {
    threads = threads.filter((t) => t.anchor.pageId === options.page);
  }
  if (options.frame) {
    threads = threads.filter((t) => t.anchor.frameId === options.frame);
  }

  if (options.json) {
    process.stdout.write(JSON.stringify(threads, null, 2) + '\n');
    return threads;
  }

  if (threads.length === 0) {
    console.log(
      options.all
        ? `No comments on prototype board "${boardId}".`
        : `No open comments on prototype board "${boardId}".`
    );
    return threads;
  }

  for (const t of threads) {
    const messages = (t.comments || []).filter((c) => c.type === 'comment');
    console.log(
      `[${t.status.toUpperCase()}] ${t.id}  ${t.anchorLabel}  ${dim(`(frame: ${t.anchor.frameId || 'canvas'}${t.anchor.blockKey ? `, block: ${t.anchor.blockKey}` : ''})`)}`
    );
    for (const m of messages) {
      const text = (m.content || m.body || '').replace(/\s+/g, ' ').trim();
      console.log(`  - ${m.createdBy}: ${text}`);
    }
  }
  return threads;
}
