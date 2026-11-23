/**
 * Isomorphic AI UX prototyping toolset and built-in skills for Root CMS
 * Prototypes (`/cms/prototypes/:boardId`).
 *
 * Browser- and Node-safe: do not import server-only modules here.
 */
import {tool, type ToolSet} from 'ai';
import {z} from 'zod';
import {
  getOrderedBlocks,
  type PrototypeBlock,
  type PrototypeBlockMap,
  type PrototypeBoard,
  type PrototypeCommentThread,
  type PrototypeComponentOrigin,
  type PrototypeComponentSpec,
  type PrototypeFrame,
  type PrototypeProjectContext,
} from '../prototypes.js';
import type {SerializedAiSkill} from './extensions.js';

/** Horizontal spacing in CSS px between auto-positioned frames on a page. */
export const FRAME_AUTO_LAYOUT_GAP = 80;

/** Default starting canvas world coordinates for the first frame on a page. */
export const DEFAULT_FRAME_START_X = 80;
export const DEFAULT_FRAME_START_Y = 80;

/** Default desktop frame width in CSS px when omitted. */
export const DEFAULT_FRAME_WIDTH = 1440;

/** Default estimated frame height used for overlap checks before measurement. */
const DEFAULT_ESTIMATED_FRAME_HEIGHT = 900;

/** Built-in skills available in the prototype board Root AI composer. */
export const PROTOTYPE_AI_SKILLS: SerializedAiSkill[] = [
  {
    name: 'explore-variants',
    description:
      'Generate 2–3 distinct UX layout frames side-by-side on the active page.',
    instructions: [
      'Generate 2–3 meaningfully distinct UX layout variants side-by-side on the active page immediately in this turn.',
      '1. Call `board_overview` and `components_list` first. If the board is empty or the user references an existing site page (e.g. home page, pricing, docs), also read the real CMS content via `collections_list` / `docs_list` / `doc_get` (such as `Pages/index`) — NEVER stop to ask clarifying questions because the board has 0 frames.',
      '2. Inspect the most relevant existing site components and UI shell (`GlobalHeader`, `GlobalFooter`, hero/section templates) via `component_inspect` before reusing them so your Tailwind v4 Visual Twins accurately reflect the site code and design tokens.',
      '3. Reuse existing site components whenever they fit (saving reusable Visual Twins via `component_save_spec` with `origin: "existing"` when helpful), and propose net-new components via `component_save_spec` (`origin: "proposed"` with a clear `rationale`) only where existing site components do not cover the UX need.',
      '4. Create 2–3 complete, high-fidelity full-page frames on the active page via `frame_create` (omit `x` and `y` so frames are placed side-by-side without overlapping). Include realistic header nav, rich typography/copy, inline SVG icons, cards/surfaces, and footer.',
      '5. Summarize each variant, which existing components were reused, and any proposed net-new components.',
    ].join('\n'),
  },
  {
    name: 'address-comments',
    description:
      'Read open comment threads and update or fork the frame to address every piece of feedback.',
    instructions: [
      'Address every open comment thread on the selected frame (or active page if no frame is selected).',
      '1. Call `board_overview` and `frame_comments_list` to read all open comments, including their `anchorLabel`, `blockKey`, and reply history.',
      '2. If no open comments exist, tell the user concisely and ask what they would like to change.',
      '3. Decide whether to update the selected frame in place via `frame_edit` or fork a new comparison frame via `frame_duplicate` + `frame_edit` (prefer updating in place for targeted fixes, and forking when comments request a major structural exploration or when the user asks to preserve the original).',
      '4. Ensure every open comment is reflected in the updated blocks and copy, respecting the board theme tokens and reusing existing site components where appropriate.',
      '5. Summarize each comment addressed and what changed in the frame.',
    ].join('\n'),
  },
  {
    name: 'propose-component',
    description:
      'Propose a reusable net-new component matching board tokens and place it in the selected frame.',
    instructions: [
      'Design and propose a reusable net-new component that matches the board design system.',
      '1. Call `board_overview` and `components_list` to confirm no existing site component already serves this purpose, and inspect 1–2 existing components via `component_inspect` if needed to match typography, spacing, and visual hierarchy.',
      '2. Author clean, responsive Tailwind v4 HTML using the board `@theme` custom properties (`--color-bg`, `--color-surface`, `--color-fg`, `--color-muted`, `--color-primary`, `--color-on-primary`, `--color-border`, `--font-sans`, `--font-heading`, `--radius-base`).',
      '3. Save the reusable specification with `component_save_spec` using `origin: "proposed"` and include a concise `description` and `rationale` explaining why a net-new component is needed.',
      '4. Place the proposed component into the currently selected frame using `frame_edit` (with `proposed: true`), or create a frame on the active page via `frame_create` if no frame is selected.',
      '5. Summarize the proposed component, its rationale, and where it was placed.',
    ].join('\n'),
  },
];

/** Input shape for creating or inserting a component block in a frame. */
export interface PrototypeBlockInput {
  /** Optional stable block key; auto-generated if omitted. */
  key?: string;
  /** Component identifier, e.g. `TemplateHero` or `PricingMatrix`. */
  component: string;
  /** Human-readable label shown in selection tags and AI context chips. */
  label: string;
  /** True when synthesized as a net-new component rather than an existing site schema. */
  proposed?: boolean;
  /** Sanitized HTML + Tailwind markup rendered inside the isolated frame. */
  html?: string;
  /** Optional scoped CSS rules for this block. */
  css?: string;
}

/** Supported block-level edit operations for `frame_edit`. */
export type FrameBlockOperation =
  | {
      op: 'insert';
      block: PrototypeBlockInput;
      index?: number;
      beforeBlockKey?: string;
      afterBlockKey?: string;
    }
  | {
      op: 'update';
      blockKey: string;
      component?: string;
      label?: string;
      proposed?: boolean;
      html?: string;
      css?: string;
    }
  | {
      op: 'remove';
      blockKey: string;
    }
  | {
      op: 'reorder';
      order?: string[];
      blockKey?: string;
      toIndex?: number;
    }
  | {
      op: 'replaceAll';
      blocks: PrototypeBlockInput[];
    };

/** Result of applying a sequence of `FrameBlockOperation`s to a block map. */
export interface ApplyFrameBlockOperationsResult {
  /** Whether all operations succeeded without error. */
  ok: boolean;
  /** Resulting block map when `ok` is true. */
  blocks: PrototypeBlockMap;
  /** Error description when `ok` is false. */
  error?: string;
  /** Labels of blocks inserted or modified during the edit. */
  changedBlockLabels: string[];
}

/** Current hydrated state exposed by `PrototypeToolBackend.getState()`. */
export interface PrototypeToolBoardState {
  board: PrototypeBoard;
  activePageId: string;
  selectedFrameId: string | null;
  selectedBlockKey: string | null;
  frames: PrototypeFrame[];
  components: Record<string, PrototypeComponentSpec>;
  comments: PrototypeCommentThread[];
}

/** Data/API backend injected into `createPrototypeAiTools`. */
export interface PrototypeToolBackend {
  /** Returns the latest board state snapshot (frames, components, comments, pages). */
  getState: () => PrototypeToolBoardState;
  /** Loads read-only project schema summaries and optional component source excerpts. */
  getProjectContext: (options?: {
    componentNames?: string[];
  }) => Promise<PrototypeProjectContext>;
  /** Persists a new or updated frame and returns the saved frame. */
  saveFrame: (
    frame: Partial<PrototypeFrame> & {id: string}
  ) => Promise<PrototypeFrame>;
  /** Persists a reusable component spec and returns the saved spec. */
  saveComponent: (
    spec: Omit<PrototypeComponentSpec, 'updatedAt' | 'updatedBy'>
  ) => Promise<PrototypeComponentSpec>;
  /** Optional id generator for newly created frames or blocks. */
  generateId?: (prefix: string) => string;
}

/** Deep-clones plain JSON-serializable board objects so snapshots remain immutable. */
function cloneSnapshot<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Generates a compact URL-safe random id with a prefix. */
export function defaultGeneratePrototypeId(prefix: string): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
  }
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

/** Normalizes a string into a safe block key slug. */
function slugifyKey(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'block'
  );
}

/** Picks a unique block key not already present in `usedKeys`. */
function allocateBlockKey(
  preferredKey: string | undefined,
  component: string,
  usedKeys: Set<string>
): string {
  const candidate = preferredKey?.trim();
  if (candidate && candidate !== '_array' && !usedKeys.has(candidate)) {
    usedKeys.add(candidate);
    return candidate;
  }
  const base = slugifyKey(candidate || component);
  let index = 1;
  while (usedKeys.has(`${base}_${index}`)) {
    index += 1;
  }
  const allocated = `${base}_${index}`;
  usedKeys.add(allocated);
  return allocated;
}

/** Hydrates a `PrototypeBlockInput` into a full `PrototypeBlock` using saved specs as fallback. */
function materializeBlock(
  input: PrototypeBlockInput,
  components: Record<string, PrototypeComponentSpec>
): PrototypeBlock {
  const spec = components[input.component];
  const html =
    typeof input.html === 'string' && input.html.trim().length > 0
      ? input.html
      : spec?.defaultHtml || '';
  const css = input.css !== undefined ? input.css : spec?.css;
  const proposed =
    input.proposed !== undefined
      ? input.proposed
      : spec?.origin === 'proposed'
        ? true
        : undefined;
  const block: PrototypeBlock = {
    component: input.component,
    label: input.label || spec?.label || input.component,
    html,
  };
  if (proposed) {
    block.proposed = true;
  }
  if (css) {
    block.css = css;
  }
  return block;
}

/** Builds a normalized `PrototypeBlockMap` from an ordered array of block inputs. */
export function buildBlockMap(
  blocks: PrototypeBlockInput[],
  components: Record<string, PrototypeComponentSpec> = {}
): PrototypeBlockMap {
  const usedKeys = new Set<string>();
  const map: PrototypeBlockMap = {_array: []};
  for (const input of blocks) {
    const key = allocateBlockKey(input.key, input.component, usedKeys);
    map._array.push(key);
    map[key] = materializeBlock(input, components);
  }
  return map;
}

/** Clones an existing `PrototypeBlockMap` cleanly. */
function cloneBlockMap(
  blocks: PrototypeBlockMap | undefined
): PrototypeBlockMap {
  const ordered = getOrderedBlocks(blocks);
  const map: PrototypeBlockMap = {_array: []};
  for (const {key, block} of ordered) {
    map._array.push(key);
    map[key] = cloneSnapshot(block);
  }
  return map;
}

/** Tests whether two axis-aligned frame rectangles overlap. */
function rectsOverlap(
  a: {x: number; y: number; width: number; height: number},
  b: {x: number; y: number; width: number; height: number}
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Computes non-overlapping canvas coordinates `(x, y)` for a new frame on
 * `pageId`, spaced horizontally by `width + 80` (`FRAME_AUTO_LAYOUT_GAP`) from
 * neighboring frames.
 */
export function computeNextFramePosition(
  existingFrames: PrototypeFrame[],
  pageId: string,
  width: number,
  anchorFrame?: PrototypeFrame | null
): {x: number; y: number} {
  const pageFrames = existingFrames.filter((frame) => frame.pageId === pageId);
  if (pageFrames.length === 0) {
    return {x: DEFAULT_FRAME_START_X, y: DEFAULT_FRAME_START_Y};
  }

  const candidateHeight = DEFAULT_ESTIMATED_FRAME_HEIGHT;
  const boxes = pageFrames.map((frame) => ({
    x: frame.x,
    y: frame.y,
    width: Math.max(1, frame.width || DEFAULT_FRAME_WIDTH),
    height: Math.max(200, frame.cachedHeight || DEFAULT_ESTIMATED_FRAME_HEIGHT),
  }));

  // When duplicating a frame on the same page, try placing directly to its right first.
  if (anchorFrame && anchorFrame.pageId === pageId) {
    const preferred = {
      x: Math.round(
        anchorFrame.x +
          Math.max(1, anchorFrame.width || width) +
          FRAME_AUTO_LAYOUT_GAP
      ),
      y: Math.round(anchorFrame.y),
    };
    const candidateBox = {
      x: preferred.x,
      y: preferred.y,
      width: Math.max(1, width),
      height: candidateHeight,
    };
    if (!boxes.some((box) => rectsOverlap(candidateBox, box))) {
      return preferred;
    }
  }

  // Place to the right of the rightmost frame on the page, aligned with the row's Y.
  let rightmost = pageFrames[0];
  for (const frame of pageFrames) {
    const rightEdge = frame.x + (frame.width || DEFAULT_FRAME_WIDTH);
    const bestRightEdge =
      rightmost.x + (rightmost.width || DEFAULT_FRAME_WIDTH);
    if (rightEdge > bestRightEdge) {
      rightmost = frame;
    }
  }

  const y = Math.round(
    anchorFrame && anchorFrame.pageId === pageId ? anchorFrame.y : rightmost.y
  );
  let x = Math.round(
    rightmost.x + Math.max(1, rightmost.width || width) + FRAME_AUTO_LAYOUT_GAP
  );

  // Guard against any edge-case overlap by advancing past all colliding boxes.
  let guard = 0;
  while (guard < 50) {
    const candidateBox = {
      x,
      y,
      width: Math.max(1, width),
      height: candidateHeight,
    };
    const collider = boxes.find((box) => rectsOverlap(candidateBox, box));
    if (!collider) {
      break;
    }
    x = Math.round(collider.x + collider.width + FRAME_AUTO_LAYOUT_GAP);
    guard += 1;
  }

  return {x, y};
}

/**
 * Applies a sequence of block operations (`insert`, `update`, `remove`,
 * `reorder`, `replaceAll`) to a `PrototypeBlockMap` without mutating the input.
 */
export function applyFrameBlockOperations(
  currentBlocks: PrototypeBlockMap | undefined,
  operations: FrameBlockOperation[],
  components: Record<string, PrototypeComponentSpec> = {}
): ApplyFrameBlockOperationsResult {
  let map = cloneBlockMap(currentBlocks);
  const usedKeys = new Set<string>(map._array);
  const changedBlockLabels: string[] = [];

  for (const operation of operations) {
    if (operation.op === 'replaceAll') {
      map = buildBlockMap(operation.blocks, components);
      usedKeys.clear();
      for (const key of map._array) {
        usedKeys.add(key);
        const block = map[key] as PrototypeBlock;
        changedBlockLabels.push(block.label);
      }
      continue;
    }

    if (operation.op === 'insert') {
      const key = allocateBlockKey(
        operation.block.key,
        operation.block.component,
        usedKeys
      );
      const block = materializeBlock(operation.block, components);
      let insertIndex = map._array.length;
      if (operation.beforeBlockKey) {
        const idx = map._array.indexOf(operation.beforeBlockKey);
        if (idx === -1) {
          return {
            ok: false,
            blocks: map,
            error: `Block "${operation.beforeBlockKey}" not found for beforeBlockKey.`,
            changedBlockLabels,
          };
        }
        insertIndex = idx;
      } else if (operation.afterBlockKey) {
        const idx = map._array.indexOf(operation.afterBlockKey);
        if (idx === -1) {
          return {
            ok: false,
            blocks: map,
            error: `Block "${operation.afterBlockKey}" not found for afterBlockKey.`,
            changedBlockLabels,
          };
        }
        insertIndex = idx + 1;
      } else if (
        typeof operation.index === 'number' &&
        Number.isFinite(operation.index)
      ) {
        insertIndex = Math.max(
          0,
          Math.min(map._array.length, Math.floor(operation.index))
        );
      }
      map._array.splice(insertIndex, 0, key);
      map[key] = block;
      changedBlockLabels.push(block.label);
      continue;
    }

    if (operation.op === 'update') {
      const existing = map[operation.blockKey];
      if (!existing || Array.isArray(existing)) {
        return {
          ok: false,
          blocks: map,
          error: `Block "${operation.blockKey}" not found.`,
          changedBlockLabels,
        };
      }
      const next: PrototypeBlock = {
        ...existing,
        ...(operation.component !== undefined
          ? {component: operation.component}
          : {}),
        ...(operation.label !== undefined ? {label: operation.label} : {}),
        ...(operation.html !== undefined ? {html: operation.html} : {}),
        ...(operation.css !== undefined ? {css: operation.css} : {}),
      };
      if (operation.proposed !== undefined) {
        if (operation.proposed) {
          next.proposed = true;
        } else {
          delete next.proposed;
        }
      }
      map[operation.blockKey] = next;
      changedBlockLabels.push(next.label);
      continue;
    }

    if (operation.op === 'remove') {
      const idx = map._array.indexOf(operation.blockKey);
      if (idx === -1) {
        return {
          ok: false,
          blocks: map,
          error: `Block "${operation.blockKey}" not found.`,
          changedBlockLabels,
        };
      }
      const existing = map[operation.blockKey];
      if (existing && !Array.isArray(existing)) {
        changedBlockLabels.push(existing.label);
      }
      map._array.splice(idx, 1);
      delete map[operation.blockKey];
      continue;
    }

    if (operation.op === 'reorder') {
      if (Array.isArray(operation.order) && operation.order.length > 0) {
        const seen = new Set<string>();
        const nextOrder: string[] = [];
        for (const key of operation.order) {
          if (!map._array.includes(key)) {
            return {
              ok: false,
              blocks: map,
              error: `Block "${key}" not found for reorder.`,
              changedBlockLabels,
            };
          }
          if (!seen.has(key)) {
            seen.add(key);
            nextOrder.push(key);
          }
        }
        // Append any existing keys omitted from `order` so blocks aren't silently lost.
        for (const key of map._array) {
          if (!seen.has(key)) {
            nextOrder.push(key);
          }
        }
        map._array = nextOrder;
      } else if (
        operation.blockKey &&
        typeof operation.toIndex === 'number' &&
        Number.isFinite(operation.toIndex)
      ) {
        const currentIdx = map._array.indexOf(operation.blockKey);
        if (currentIdx === -1) {
          return {
            ok: false,
            blocks: map,
            error: `Block "${operation.blockKey}" not found for reorder.`,
            changedBlockLabels,
          };
        }
        const [moved] = map._array.splice(currentIdx, 1);
        const clamped = Math.max(
          0,
          Math.min(map._array.length, Math.floor(operation.toIndex))
        );
        map._array.splice(clamped, 0, moved);
      } else {
        return {
          ok: false,
          blocks: map,
          error: 'Reorder requires either `order` or `blockKey` + `toIndex`.',
          changedBlockLabels,
        };
      }
    }
  }

  return {
    ok: true,
    blocks: map,
    changedBlockLabels,
  };
}

/** Strips basic HTML tags when a comment item only has an HTML `body`. */
function extractCommentText(body?: string, content?: string): string {
  if (content && content.trim()) {
    return content.trim();
  }
  if (!body) {
    return '';
  }
  return body
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Summarizes a frame compactly for tool responses to conserve tokens. */
function summarizeFrame(
  frame: PrototypeFrame,
  openCommentsByFrame: Map<string, number>
) {
  return {
    id: frame.id,
    pageId: frame.pageId,
    title: frame.title,
    width: frame.width,
    x: frame.x,
    y: frame.y,
    cachedHeight: frame.cachedHeight,
    openCommentCount: openCommentsByFrame.get(frame.id) || 0,
    blocks: getOrderedBlocks(frame.blocks).map(({key, block}) => ({
      key,
      component: block.component,
      label: block.label,
      proposed: Boolean(block.proposed),
    })),
  };
}

/** Zod schema for block inputs shared across frame creation and editing tools. */
const blockInputSchema = z.object({
  key: z
    .string()
    .optional()
    .describe('Optional stable block key; auto-generated when omitted.'),
  component: z
    .string()
    .describe(
      'Component identifier (existing schema name or proposed component name).'
    ),
  label: z
    .string()
    .describe(
      'Human-readable label shown in selection tags and context chips.'
    ),
  proposed: z
    .boolean()
    .optional()
    .describe('Set to true for net-new proposed components.'),
  html: z
    .string()
    .optional()
    .describe(
      'Tailwind v4 HTML markup for this block. Optional if referencing a saved component spec.'
    ),
  css: z.string().optional().describe('Optional scoped CSS rules.'),
});

/** Zod schema for `frame_edit` block operations. */
const frameBlockOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('insert'),
    block: blockInputSchema,
    index: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Zero-based insertion index; appends when omitted.'),
    beforeBlockKey: z
      .string()
      .optional()
      .describe('Insert immediately before this existing block key.'),
    afterBlockKey: z
      .string()
      .optional()
      .describe('Insert immediately after this existing block key.'),
  }),
  z.object({
    op: z.literal('update'),
    blockKey: z.string().describe('Key of the block to update.'),
    component: z.string().optional(),
    label: z.string().optional(),
    proposed: z.boolean().optional(),
    html: z.string().optional(),
    css: z.string().optional(),
  }),
  z.object({
    op: z.literal('remove'),
    blockKey: z.string().describe('Key of the block to remove.'),
  }),
  z.object({
    op: z.literal('reorder'),
    order: z
      .array(z.string())
      .optional()
      .describe('Full ordered list of block keys from top to bottom.'),
    blockKey: z
      .string()
      .optional()
      .describe('Single block key to move (used with `toIndex`).'),
    toIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Target zero-based index for `blockKey`.'),
  }),
  z.object({
    op: z.literal('replaceAll'),
    blocks: z.array(blockInputSchema),
  }),
]);

/**
 * Creates the AI UX prototyping `ToolSet` that executes directly inside
 * `streamText` against the provided `PrototypeToolBackend`.
 */
export function createPrototypeAiTools(backend: PrototypeToolBackend): ToolSet {
  const generateId = backend.generateId || defaultGeneratePrototypeId;

  // Track frames and components synchronously before async network saves settle
  // so parallel `frame_create` / `frame_duplicate` calls in a single LLM step
  // never collide at the same `(x, y)` canvas coordinates.
  const pendingFrames = new Map<string, PrototypeFrame>();
  const committedFrames = new Map<string, PrototypeFrame>();
  const committedComponents = new Map<string, PrototypeComponentSpec>();
  const frameEditQueues = new Map<string, Promise<unknown>>();

  function getEffectiveState(): PrototypeToolBoardState {
    const raw = backend.getState();
    const framesById = new Map<string, PrototypeFrame>();
    for (const frame of raw.frames) {
      framesById.set(frame.id, frame);
    }
    for (const [id, committed] of committedFrames.entries()) {
      const fromBackend = framesById.get(id);
      if (!fromBackend) {
        framesById.set(id, committed);
      } else if ((fromBackend.updatedAt || 0) >= (committed.updatedAt || 0)) {
        committedFrames.delete(id);
      } else {
        framesById.set(id, committed);
      }
    }
    for (const [id, pending] of pendingFrames.entries()) {
      framesById.set(id, pending);
    }

    const components: Record<string, PrototypeComponentSpec> = {
      ...raw.components,
    };
    for (const [name, committed] of committedComponents.entries()) {
      const fromBackend = components[name];
      if (!fromBackend) {
        components[name] = committed;
      } else if ((fromBackend.updatedAt || 0) >= (committed.updatedAt || 0)) {
        committedComponents.delete(name);
      } else {
        components[name] = committed;
      }
    }

    return {
      ...raw,
      frames: Array.from(framesById.values()),
      components,
    };
  }

  function runSerializedFrameEdit<T>(
    frameId: string,
    task: () => Promise<T>
  ): Promise<T> {
    const previous = frameEditQueues.get(frameId) || Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    frameEditQueues.set(
      frameId,
      next.finally(() => {
        if (frameEditQueues.get(frameId) === next) {
          frameEditQueues.delete(frameId);
        }
      })
    );
    return next;
  }

  return {
    board_overview: tool({
      description:
        'Inspect the prototype board structure: pages, frames on each page ' +
        '(id, title, width, x, y, block keys/labels/proposed flags), active ' +
        'selection, theme tokens, and open comment counts.',
      inputSchema: z.object({
        pageId: z
          .string()
          .optional()
          .describe('Optional page id to filter frames to a single page.'),
      }),
      execute: async ({pageId}) => {
        const state = getEffectiveState();
        const openCommentsByFrame = new Map<string, number>();
        const openCommentsByPage = new Map<string, number>();
        let totalOpenComments = 0;

        for (const thread of state.comments) {
          if (thread.status !== 'open') {
            continue;
          }
          totalOpenComments += 1;
          const pId = thread.anchor.pageId;
          openCommentsByPage.set(pId, (openCommentsByPage.get(pId) || 0) + 1);
          if (thread.anchor.frameId) {
            const fId = thread.anchor.frameId;
            openCommentsByFrame.set(
              fId,
              (openCommentsByFrame.get(fId) || 0) + 1
            );
          }
        }

        const targetPages = pageId
          ? state.board.pages.filter((p) => p.id === pageId)
          : state.board.pages;

        return {
          boardId: state.board.id,
          title: state.board.title,
          description: state.board.description || '',
          activePageId: state.activePageId,
          selectedFrameId: state.selectedFrameId,
          selectedBlockKey: state.selectedBlockKey,
          theme: state.board.theme,
          totalOpenComments,
          pages: targetPages.map((page) => {
            const pageFrames = state.frames.filter(
              (frame) => frame.pageId === page.id
            );
            return {
              id: page.id,
              name: page.name,
              frameCount: pageFrames.length,
              openCommentCount: openCommentsByPage.get(page.id) || 0,
              frames: pageFrames.map((frame) =>
                summarizeFrame(frame, openCommentsByFrame)
              ),
            };
          }),
        };
      },
    }),

    components_list: tool({
      description:
        'Return a compact index of existing project site component schemas ' +
        'and saved prototype component specs (Visual Twins and Proposed ' +
        'components). Call `component_inspect` to read full field definitions ' +
        'and source code for specific components.',
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe('Optional case-insensitive filter on name or label.'),
      }),
      execute: async ({query}) => {
        const [context, state] = await Promise.all([
          backend.getProjectContext(),
          Promise.resolve(getEffectiveState()),
        ]);
        const needle = query?.trim().toLowerCase() || '';
        const matchesQuery = (
          name: string,
          label?: string,
          description?: string
        ) => {
          if (!needle) {
            return true;
          }
          return (
            name.toLowerCase().includes(needle) ||
            (label || '').toLowerCase().includes(needle) ||
            (description || '').toLowerCase().includes(needle)
          );
        };

        const existingSchemas = context.schemas
          .filter((schema) =>
            matchesQuery(schema.name, schema.label, schema.description)
          )
          .map((schema) => ({
            name: schema.name,
            label: schema.label,
            description: schema.description,
            fieldCount: schema.fields.length,
            fieldNames: schema.fields.slice(0, 8).map((f) => f.id),
            hasVisualTwin: Boolean(state.components[schema.name]),
          }));

        const savedSpecs = Object.values(state.components)
          .filter((spec) =>
            matchesQuery(spec.name, spec.label, spec.description)
          )
          .map((spec) => ({
            name: spec.name,
            label: spec.label,
            origin: spec.origin,
            description: spec.description,
            rationale: spec.rationale,
          }));

        return {
          existingSchemas,
          savedSpecs,
        };
      },
    }),

    component_inspect: tool({
      description:
        'Fetch full schema field definitions, bounded `.tsx`/`.scss` source ' +
        'reference excerpts, style excerpts, and any cached Visual Twin specs ' +
        'for the named components before synthesizing accurate Tailwind Visual Twins.',
      inputSchema: z.object({
        names: z
          .array(z.string())
          .min(1)
          .max(12)
          .describe('Component schema names to inspect.'),
      }),
      execute: async ({names}) => {
        const [context, state] = await Promise.all([
          backend.getProjectContext({componentNames: names}),
          Promise.resolve(getEffectiveState()),
        ]);
        const schemasByName = new Map(
          context.schemas.map((schema) => [schema.name, schema])
        );
        const inspected = names.map((name) => {
          const schema = schemasByName.get(name) || null;
          const sources = context.componentSources?.[name] || [];
          const savedSpec = state.components[name] || null;
          return {
            name,
            schema,
            sources,
            savedSpec: savedSpec
              ? {
                  name: savedSpec.name,
                  label: savedSpec.label,
                  origin: savedSpec.origin,
                  description: savedSpec.description,
                  rationale: savedSpec.rationale,
                  defaultHtml: savedSpec.defaultHtml,
                  css: savedSpec.css,
                }
              : null,
          };
        });
        return {
          theme: state.board.theme,
          defaultTheme: context.defaultTheme,
          styleExcerpts: context.styleExcerpts || [],
          components: inspected,
        };
      },
    }),

    component_save_spec: tool({
      description:
        'Save a reusable component specification: either a Visual Twin ' +
        '(`origin: "existing"`) representing an existing site schema, or a ' +
        'net-new Proposed Component (`origin: "proposed"`) with a clear design rationale.',
      inputSchema: z.object({
        name: z
          .string()
          .min(1)
          .describe(
            'Component identifier, e.g. `TemplateHero` or `PricingMatrix`.'
          ),
        label: z
          .string()
          .min(1)
          .describe('Human-readable label, e.g. `Pricing matrix`.'),
        origin: z
          .enum(['existing', 'proposed'] as [
            PrototypeComponentOrigin,
            PrototypeComponentOrigin,
          ])
          .describe('`existing` for a Visual Twin, `proposed` for net-new.'),
        description: z
          .string()
          .optional()
          .describe(
            'Short summary of what the component displays and when to use it.'
          ),
        rationale: z
          .string()
          .optional()
          .describe(
            'Why this net-new component is proposed (for `proposed` origin).'
          ),
        defaultHtml: z
          .string()
          .min(1)
          .describe('Default sanitized Tailwind v4 HTML markup.'),
        css: z.string().optional().describe('Optional scoped CSS rules.'),
      }),
      execute: async (input) => {
        const saved = await backend.saveComponent({
          name: input.name,
          label: input.label,
          origin: input.origin,
          description: input.description,
          rationale: input.rationale,
          defaultHtml: input.defaultHtml,
          css: input.css,
        });
        committedComponents.set(saved.name, saved);
        return {
          saved: true,
          spec: {
            name: saved.name,
            label: saved.label,
            origin: saved.origin,
            description: saved.description,
            rationale: saved.rationale,
          },
        };
      },
    }),

    frame_create: tool({
      description:
        'Create a new artboard frame on a page with an ordered list of ' +
        'component blocks. Omit `x` and `y` to auto-place without overlapping ' +
        'existing frames (spaced horizontally by width + 80px).',
      inputSchema: z.object({
        title: z.string().min(1).describe('Display title, e.g. `Pricing B`.'),
        pageId: z
          .string()
          .optional()
          .describe('Target page id; defaults to the currently active page.'),
        width: z
          .number()
          .int()
          .min(320)
          .max(2560)
          .optional()
          .describe(
            'Viewport width in CSS px (e.g. 1440 desktop, 390 mobile).'
          ),
        x: z
          .number()
          .optional()
          .describe('Optional canvas world X coordinate.'),
        y: z
          .number()
          .optional()
          .describe('Optional canvas world Y coordinate.'),
        blocks: z
          .array(blockInputSchema)
          .describe('Ordered list of component blocks from top to bottom.'),
      }),
      execute: async (input) => {
        const state = getEffectiveState();
        const pageId = input.pageId || state.activePageId;
        const width = input.width || DEFAULT_FRAME_WIDTH;
        const autoPos = computeNextFramePosition(state.frames, pageId, width);
        const x =
          typeof input.x === 'number' && Number.isFinite(input.x)
            ? Math.round(input.x)
            : autoPos.x;
        const y =
          typeof input.y === 'number' && Number.isFinite(input.y)
            ? Math.round(input.y)
            : autoPos.y;
        const blocks = buildBlockMap(input.blocks, state.components);
        const id = generateId('frame');
        const trimmedTitle = input.title.trim();
        const now = Date.now();

        // Reserve coordinates synchronously before awaiting network persistence
        // so sibling `frame_create` calls in the same parallel batch place
        // themselves cleanly to the right instead of stacking.
        pendingFrames.set(id, {
          id,
          boardId: state.board.id,
          pageId,
          title: trimmedTitle,
          width,
          x,
          y,
          blocks,
          createdAt: now,
          createdBy: '',
          updatedAt: now,
          updatedBy: '',
        });

        try {
          const saved = await backend.saveFrame({
            id,
            boardId: state.board.id,
            pageId,
            title: trimmedTitle,
            width,
            x,
            y,
            blocks,
          });
          committedFrames.set(saved.id, saved);
          return {
            created: true,
            frame: summarizeFrame(saved, new Map()),
          };
        } finally {
          pendingFrames.delete(id);
        }
      },
    }),

    frame_duplicate: tool({
      description:
        'Clone an existing frame onto a page at a non-overlapping X offset, ' +
        'optionally overriding its title, viewport width, or blocks (useful ' +
        'for forking a variant like "Fork Pricing A and try a 3-tier layout").',
      inputSchema: z.object({
        sourceFrameId: z
          .string()
          .min(1)
          .describe('Id of the existing frame to clone.'),
        title: z
          .string()
          .optional()
          .describe('Title for the duplicated frame.'),
        pageId: z
          .string()
          .optional()
          .describe('Target page id; defaults to the source frame page.'),
        width: z
          .number()
          .int()
          .min(320)
          .max(2560)
          .optional()
          .describe('Optional viewport width override in CSS px.'),
        x: z.number().optional(),
        y: z.number().optional(),
        blocks: z
          .array(blockInputSchema)
          .optional()
          .describe('Optional replacement blocks for the duplicated frame.'),
      }),
      execute: async (input) => {
        const state = getEffectiveState();
        const source = state.frames.find(
          (frame) => frame.id === input.sourceFrameId
        );
        if (!source) {
          return {
            duplicated: false,
            error: `Source frame "${input.sourceFrameId}" not found.`,
          };
        }
        const pageId = input.pageId || source.pageId;
        const width = input.width || source.width || DEFAULT_FRAME_WIDTH;
        const autoPos = computeNextFramePosition(
          state.frames,
          pageId,
          width,
          pageId === source.pageId ? source : null
        );
        const x =
          typeof input.x === 'number' && Number.isFinite(input.x)
            ? Math.round(input.x)
            : autoPos.x;
        const y =
          typeof input.y === 'number' && Number.isFinite(input.y)
            ? Math.round(input.y)
            : autoPos.y;
        const blocks = input.blocks
          ? buildBlockMap(input.blocks, state.components)
          : cloneBlockMap(source.blocks);
        const id = generateId('frame');
        const nextTitle = input.title?.trim() || `${source.title} (Copy)`;
        const cachedHeight = input.blocks ? undefined : source.cachedHeight;
        const now = Date.now();

        pendingFrames.set(id, {
          id,
          boardId: state.board.id,
          pageId,
          title: nextTitle,
          width,
          x,
          y,
          cachedHeight,
          blocks,
          createdAt: now,
          createdBy: '',
          updatedAt: now,
          updatedBy: '',
        });

        try {
          const saved = await backend.saveFrame({
            id,
            boardId: state.board.id,
            pageId,
            title: nextTitle,
            width,
            x,
            y,
            cachedHeight,
            blocks,
          });
          committedFrames.set(saved.id, saved);
          return {
            duplicated: true,
            frame: summarizeFrame(saved, new Map()),
          };
        } finally {
          pendingFrames.delete(id);
        }
      },
    }),

    frame_edit: tool({
      description:
        'Update an existing frame title, width, pageId, canvas position (`x`, `y`), ' +
        'and/or apply targeted block operations (`insert`, `update`, `remove`, ' +
        '`reorder`, or `replaceAll`). Prefer targeted operations over `replaceAll` ' +
        'when modifying one or two blocks.',
      inputSchema: z.object({
        frameId: z.string().min(1).describe('Id of the frame to edit.'),
        title: z.string().optional().describe('Optional updated frame title.'),
        width: z
          .number()
          .int()
          .min(320)
          .max(2560)
          .optional()
          .describe('Optional updated viewport width in CSS px.'),
        pageId: z
          .string()
          .optional()
          .describe('Optional page id to move the frame to.'),
        x: z
          .number()
          .optional()
          .describe('Optional updated canvas world X coordinate.'),
        y: z
          .number()
          .optional()
          .describe('Optional updated canvas world Y coordinate.'),
        operations: z
          .array(frameBlockOperationSchema)
          .optional()
          .describe('Ordered list of block mutations to apply.'),
      }),
      execute: async (input) =>
        runSerializedFrameEdit(input.frameId, async () => {
          const state = getEffectiveState();
          const existing = state.frames.find(
            (frame) => frame.id === input.frameId
          );
          if (!existing) {
            return {
              updated: false,
              error: `Frame "${input.frameId}" not found.`,
            };
          }

          let nextBlocks = cloneBlockMap(existing.blocks);
          if (input.operations && input.operations.length > 0) {
            const opResult = applyFrameBlockOperations(
              existing.blocks,
              input.operations,
              state.components
            );
            if (!opResult.ok) {
              return {
                updated: false,
                error: opResult.error || 'Failed to apply block operations.',
              };
            }
            nextBlocks = opResult.blocks;
          }

          const nextX =
            typeof input.x === 'number' && Number.isFinite(input.x)
              ? Math.round(input.x)
              : existing.x;
          const nextY =
            typeof input.y === 'number' && Number.isFinite(input.y)
              ? Math.round(input.y)
              : existing.y;

          const saved = await backend.saveFrame({
            id: existing.id,
            boardId: existing.boardId,
            pageId: input.pageId || existing.pageId,
            title: input.title?.trim() || existing.title,
            width: input.width || existing.width,
            x: nextX,
            y: nextY,
            blocks: nextBlocks,
          });
          committedFrames.set(saved.id, saved);
          return {
            updated: true,
            frame: summarizeFrame(saved, new Map()),
          };
        }),
    }),

    frame_comments_list: tool({
      description:
        'List comment threads anchored to a frame or page (defaults to open ' +
        'threads on the active page). Returns author, anchorLabel, blockKey, ' +
        'and full plain-text comment items.',
      inputSchema: z.object({
        frameId: z
          .string()
          .optional()
          .describe('Optional frame id to filter comments.'),
        pageId: z
          .string()
          .optional()
          .describe(
            'Optional page id to filter comments (defaults to active page when frameId is omitted).'
          ),
        includeResolved: z
          .boolean()
          .optional()
          .describe(
            'Set true to include resolved threads as well as open ones.'
          ),
      }),
      execute: async ({frameId, pageId, includeResolved}) => {
        const state = getEffectiveState();
        const targetPageId = frameId ? undefined : pageId || state.activePageId;
        const threads = state.comments.filter((thread) => {
          if (!includeResolved && thread.status !== 'open') {
            return false;
          }
          if (frameId) {
            return thread.anchor.frameId === frameId;
          }
          if (targetPageId) {
            return thread.anchor.pageId === targetPageId;
          }
          return true;
        });

        return {
          count: threads.length,
          comments: threads.map((thread) => {
            const messages = thread.comments
              .filter((item) => item.type === 'comment')
              .map((item) => ({
                author: item.createdBy,
                text: extractCommentText(item.body, item.content),
                createdAt: item.createdAt,
              }));
            const primary = messages[0];
            return {
              id: thread.id,
              status: thread.status,
              pageId: thread.anchor.pageId,
              frameId: thread.anchor.frameId,
              anchorLabel: thread.anchorLabel,
              blockKey: thread.anchor.blockKey || null,
              author: primary?.author || thread.createdBy,
              text: primary?.text || '',
              replies: messages.slice(1),
            };
          }),
        };
      },
    }),
  };
}

/**
 * Formats a concise, present-participle live status label for a prototype AI
 * tool call while it is streaming or executing in the UI.
 */
export function prettyPrototypeToolLabel(
  toolName: string,
  input: Record<string, any> | undefined
): string {
  switch (toolName) {
    case 'board_overview':
      return 'Reading board overview…';
    case 'components_list':
      return 'Listing available components…';
    case 'component_inspect': {
      const names = Array.isArray(input?.names) ? input.names.slice(0, 3) : [];
      return names.length > 0
        ? `Inspecting ${names.join(', ')}…`
        : 'Inspecting components…';
    }
    case 'component_save_spec': {
      const label = input?.label || input?.name;
      if (input?.origin === 'proposed') {
        return label ? `Proposing ${label}…` : 'Proposing component…';
      }
      return label ? `Saving ${label}…` : 'Saving component…';
    }
    case 'frame_create':
      return input?.title
        ? `Creating frame ${input.title}…`
        : 'Creating frame…';
    case 'frame_duplicate':
      return input?.title
        ? `Duplicating frame ${input.title}…`
        : 'Duplicating frame…';
    case 'frame_edit': {
      const ops = Array.isArray(input?.operations) ? input.operations : [];
      const firstLabel = ops[0]?.label || ops[0]?.block?.label || input?.title;
      return firstLabel ? `Editing ${firstLabel}…` : 'Editing frame…';
    }
    case 'frame_comments_list':
      return 'Reading open comments…';
    case 'collections_list':
      return 'Listing CMS collections…';
    case 'docs_list':
      return input?.collection
        ? `Listing ${input.collection} documents…`
        : 'Listing CMS documents…';
    case 'doc_get':
      return input?.docId ? `Reading ${input.docId}…` : 'Reading CMS document…';
    case 'schema_get':
      return input?.collection
        ? `Reading ${input.collection} schema…`
        : 'Reading collection schema…';
    default:
      return `Running ${toolName}…`;
  }
}
