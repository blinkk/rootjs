/**
 * Shared types and pure helpers for Root CMS UX Prototypes (`/cms/prototypes`).
 *
 * Browser- and Node-safe: do not import server-only modules here.
 */

/** Default pages created on every new prototype board. */
export const DEFAULT_PROTOTYPE_PAGES: readonly PrototypeBoardPage[] = [
  {id: 'page-1', name: 'Page 1'},
];

/** Default simulated fold heights (in CSS px) used for `--proto-vh`. */
export const DEFAULT_FOLD_HEIGHT_DESKTOP = 900;
export const DEFAULT_FOLD_HEIGHT_MOBILE = 844;

/** Maximum live sandboxed iframes mounted simultaneously on the canvas. */
export const MAX_LIVE_PROTOTYPE_IFRAMES = 6;

/** Brand design tokens extracted for a prototype board's `@theme` block. */
export interface PrototypeTheme {
  /** Primary body font stack. */
  fontSans?: string;
  /** Heading font stack. */
  fontHeading?: string;
  /** Monospace font stack. */
  fontMono?: string;
  /** Optional Google Fonts stylesheet URLs allowed in the frame CSP. */
  fontUrls?: string[];
  /** Page background color. */
  colorBg?: string;
  /** Elevated card/surface background color. */
  colorSurface?: string;
  /** Primary foreground text color. */
  colorFg?: string;
  /** Muted secondary text color. */
  colorMuted?: string;
  /** Brand primary accent color (buttons, CTAs). */
  colorPrimary?: string;
  /** Text color on top of `colorPrimary`. */
  colorOnPrimary?: string;
  /** Default border color. */
  colorBorder?: string;
  /** Base border radius (e.g. `8px`). */
  radius?: string;
  /** Max container width (e.g. `1280px`). */
  containerMaxWidth?: string;
}

/** A named sub-canvas page within a prototype board (similar to Figma pages). */
export interface PrototypeBoardPage {
  /** Stable URL-safe page identifier, e.g. `explorations`. */
  id: string;
  /** Human-readable page name, e.g. `Explorations`. */
  name: string;
}

/** Lifecycle status of a prototype board. */
export type PrototypeBoardStatus = 'active' | 'archived';

/** Metadata for a prototype board stored at `Projects/{pid}/Prototypes/{id}`. */
export interface PrototypeBoard {
  /** Unique board slug/id. */
  id: string;
  /** Display title, e.g. `Pricing page refresh`. */
  title: string;
  /** Optional short description shown on the prototypes list page. */
  description?: string;
  /** Active or archived board status. */
  status: PrototypeBoardStatus;
  /** Ordered pages inside the board. */
  pages: PrototypeBoardPage[];
  /** Extracted or customized brand theme tokens applied inside frames. */
  theme: PrototypeTheme;
  /** Optional linked AI chat document id. */
  aiChatId?: string;
  /** Creation epoch millis. */
  createdAt: number;
  /** Creator email address. */
  createdBy: string;
  /** Last modification epoch millis. */
  updatedAt: number;
  /** Last modifier email address. */
  updatedBy: string;
}

/** Lightweight summary returned for the `/cms/prototypes` list view. */
export interface PrototypeBoardSummary extends PrototypeBoard {
  /** Total number of frames across non-archive pages. */
  frameCount: number;
  /** Frame counts keyed by `pageId`. */
  pageFrameCounts: Record<string, number>;
  /** Count of open comment threads on the board. */
  openCommentCount: number;
  /** Up to 3 preview block structures from the first frame for card thumbnails. */
  previewFrames?: Array<{
    id: string;
    title: string;
    width: number;
    blockLabels: Array<{label: string; proposed?: boolean}>;
  }>;
}

/** A visual component block instance inside a prototype frame. */
export interface PrototypeBlock {
  /** Component identifier, e.g. `TemplateHero` or `PricingMatrix`. */
  component: string;
  /** Human-readable label shown in selection tags and AI Context chips. */
  label: string;
  /** True when synthesized as a net-new component rather than an existing site schema. */
  proposed?: boolean;
  /** Sanitized HTML + Tailwind markup rendered inside the isolated frame. */
  html: string;
  /** Optional scoped CSS rules for this block. */
  css?: string;
}

/** Keyed block collection stored on a `PrototypeFrame`. */
export interface PrototypeBlockMap {
  /** Ordered block keys from top to bottom. */
  _array: string[];
  /** Individual block entries keyed by block key. */
  [blockKey: string]: PrototypeBlock | string[];
}

/** An artboard frame stored at `Projects/{pid}/Prototypes/{boardId}/Frames/{id}`. */
export interface PrototypeFrame {
  /** Unique frame id. */
  id: string;
  /** Parent board id. */
  boardId: string;
  /** Id of the `PrototypeBoardPage` this frame sits on. */
  pageId: string;
  /** Display title, e.g. `Pricing B`. */
  title: string;
  /** CSS viewport width in px, e.g. `1440` or `390`. */
  width: number;
  /** Canvas world X coordinate in px. */
  x: number;
  /** Canvas world Y coordinate in px. */
  y: number;
  /** Last measured content height in px (used while offscreen/unloaded). */
  cachedHeight?: number;
  /** Ordered, keyed component blocks rendered inside the frame. */
  blocks: PrototypeBlockMap;
  /** Fractional or lexical sort order on the page. */
  sortOrder?: string;
  /** Creation epoch millis. */
  createdAt: number;
  /** Creator email address. */
  createdBy: string;
  /** Last modification epoch millis. */
  updatedAt: number;
  /** Last modifier email address. */
  updatedBy: string;
}

/** Origin of a reusable component template on a board or project. */
export type PrototypeComponentOrigin = 'existing' | 'proposed';

/**
 * A reusable visual component specification stored either in
 * `Projects/{pid}/PrototypeComponents/{name}` (cached Visual Twins for existing
 * schemas) or `Projects/{pid}/Prototypes/{boardId}/Components/{name}` (proposed
 * net-new components).
 */
export interface PrototypeComponentSpec {
  /** Component identifier, e.g. `TemplateHero` or `PricingMatrix`. */
  name: string;
  /** Human-readable label, e.g. `Pricing matrix`. */
  label: string;
  /** Short summary of what the component displays and when to use it. */
  description?: string;
  /** Whether this represents an existing project schema or a net-new proposal. */
  origin: PrototypeComponentOrigin;
  /** Optional design rationale for proposed components. */
  rationale?: string;
  /** Default HTML + Tailwind markup used when inserting this component. */
  defaultHtml: string;
  /** Optional scoped CSS rules. */
  css?: string;
  /** Last modification epoch millis. */
  updatedAt: number;
  /** Author email address. */
  updatedBy: string;
}

/** Spatial + block-relative anchor for a comment thread on the canvas. */
export interface PrototypeCommentAnchor {
  /** Board page id where the pin lives. */
  pageId: string;
  /** Target frame id, or `null` for a free-floating canvas comment. */
  frameId: string | null;
  /** Target block key inside `frame.blocks`, when anchored to a component. */
  blockKey?: string;
  /** Normalized horizontal offset `[0..1]` within the block or frame. */
  relX: number;
  /** Normalized vertical offset `[0..1]` within the block or frame. */
  relY: number;
  /** Fallback X coordinate (frame-relative or world-relative). */
  fallbackX: number;
  /** Fallback Y coordinate (frame-relative or world-relative). */
  fallbackY: number;
}

/** Single entry in a prototype comment thread. */
export interface PrototypeCommentItem {
  /** Unique comment item id. */
  id: string;
  /** Entry kind (`comment` message or lifecycle event). */
  type: 'comment' | 'resolved' | 'reopened';
  /** Sanitized HTML body of the comment. */
  body?: string;
  /** Plain-text summary of the comment. */
  content?: string;
  /** Mentioned user email addresses. */
  mentions?: string[];
  /** Creation epoch millis. */
  createdAt: number;
  /** Author email address. */
  createdBy: string;
}

/** Thread document stored at `Projects/{pid}/Prototypes/{boardId}/Comments/{id}`. */
export interface PrototypeCommentThread {
  /** Unique thread id. */
  id: string;
  /** Parent board id. */
  boardId: string;
  /** Spatial/block anchor location. */
  anchor: PrototypeCommentAnchor;
  /** Human-readable anchor label, e.g. `Pricing B › Pricing matrix`. */
  anchorLabel: string;
  /** Open or resolved thread status. */
  status: 'open' | 'resolved';
  /** Chronological comment items. */
  comments: PrototypeCommentItem[];
  /** Participating user emails. */
  participants: string[];
  /** Creation epoch millis. */
  createdAt: number;
  /** Creator email address. */
  createdBy: string;
  /** Last modification epoch millis. */
  updatedAt: number;
  /** Last modifier email address. */
  updatedBy: string;
  /** Resolution epoch millis, if resolved. */
  resolvedAt?: number;
  /** Resolver email address, if resolved. */
  resolvedBy?: string;
}

/** Kind of a canvas annotation: a sticky note or a large text label. */
export type PrototypeAnnotationKind = 'note' | 'label';

/** Maximum plain-text length of a note annotation. */
export const PROTOTYPE_NOTE_MAX_CHARS = 2000;

/** Maximum plain-text length of a label annotation. */
export const PROTOTYPE_LABEL_MAX_CHARS = 200;

/** Default width of a note annotation in world px. */
export const PROTOTYPE_NOTE_WIDTH = 240;

/** Font size of a label annotation in world px. */
export const PROTOTYPE_LABEL_FONT_SIZE = 48;

/**
 * A note or text label placed directly on the canvas, stored at
 * `Projects/{pid}/Prototypes/{boardId}/Annotations/{id}`. A label doubles as
 * the header of a section (a row of frames, e.g. `Round 1`).
 */
export interface PrototypeAnnotation {
  /** Unique annotation id. */
  id: string;
  /** Parent board id. */
  boardId: string;
  /** Id of the `PrototypeBoardPage` this annotation sits on. */
  pageId: string;
  /** Sticky note or large text label. */
  kind: PrototypeAnnotationKind;
  /** Plain text only. */
  text: string;
  /** World X coordinate of the top-left corner. */
  x: number;
  /** World Y coordinate of the top-left corner. */
  y: number;
  /** Note width in world px (notes only). */
  width?: number;
  /** Creation epoch millis. */
  createdAt: number;
  /** Creator email address. */
  createdBy: string;
  /** Last modification epoch millis. */
  updatedAt: number;
  /** Last modifier email address. */
  updatedBy: string;
}

/** Complete hydrated state of a single prototype board. */
export interface PrototypeBoardBundle {
  /** Board metadata and pages. */
  board: PrototypeBoard;
  /** All frames belonging to the board, sorted by `sortOrder` / `createdAt`. */
  frames: PrototypeFrame[];
  /** Reusable component specs (merged project Visual Twins + board Proposed specs). */
  components: Record<string, PrototypeComponentSpec>;
  /** Comment threads on the board. */
  comments: PrototypeCommentThread[];
  /** Notes and text labels placed on the canvas. */
  annotations: PrototypeAnnotation[];
}

/** Horizontal spacing in world px between auto-positioned frames on a page. */
export const FRAME_AUTO_LAYOUT_GAP = 80;

/** Vertical distance in world px from a section label to its row of frames. */
export const SECTION_LABEL_GAP = 96;

/** Vertical gap in world px between the tallest frame and the next section. */
export const SECTION_ROW_GAP = 320;

/** Frame height assumed for section layout before a frame is measured. */
export const SECTION_ESTIMATED_FRAME_HEIGHT = 1200;

/** Header given to earlier, unlabeled frames when a later section is added. */
export const DEFAULT_FIRST_SECTION_LABEL = 'Round 1';

/** Frame fields read by the section layout helpers. */
export type SectionLayoutFrame = Pick<
  PrototypeFrame,
  'id' | 'pageId' | 'x' | 'y' | 'width' | 'cachedHeight'
>;

/** Annotation fields read by the section layout helpers. */
export type SectionLayoutAnnotation = Pick<
  PrototypeAnnotation,
  'id' | 'pageId' | 'kind' | 'text' | 'x' | 'y'
>;

/** Normalizes a section label for case-insensitive comparison. */
function normalizeSectionLabel(text: string): string {
  return String(text || '')
    .trim()
    .toLowerCase();
}

/** Returns the `label` annotations on a page from top to bottom. */
export function getPageSectionLabels<T extends SectionLayoutAnnotation>(
  annotations: T[],
  pageId: string
): T[] {
  return annotations
    .filter((item) => item.kind === 'label' && item.pageId === pageId)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Groups a page's frames into sections. A section is a `label` annotation; a
 * frame belongs to the closest label above it (`label.y <= frame.y`), and
 * frames above every label belong to no section.
 */
export function groupFramesBySection<
  F extends SectionLayoutFrame,
  A extends SectionLayoutAnnotation,
>(
  frames: F[],
  annotations: A[],
  pageId: string
): {sections: Array<{label: A; frames: F[]}>; unsectioned: F[]} {
  const sections = getPageSectionLabels(annotations, pageId).map((label) => ({
    label,
    frames: [] as F[],
  }));
  const unsectioned: F[] = [];
  const pageFrames = frames
    .filter((frame) => frame.pageId === pageId)
    .sort((a, b) => a.x - b.x);
  for (const frame of pageFrames) {
    let owner: {label: A; frames: F[]} | null = null;
    for (const section of sections) {
      if (section.label.y <= frame.y) {
        owner = section;
      }
    }
    if (owner) {
      owner.frames.push(frame);
    } else {
      unsectioned.push(frame);
    }
  }
  return {sections, unsectioned};
}

/**
 * Computes where a new frame in the section named `sectionLabel` goes, and
 * which label annotations must be created first.
 *
 * An existing section (matched case-insensitively) gets the frame appended to
 * the right of its row. A new section starts a row below everything on the
 * page. When earlier frames have no label at all they also get a `Round 1`
 * header, so every row on the page ends up labelled.
 *
 * Pass frames and labels that are reserved but not saved yet along with the
 * stored ones, so parallel calls share one label and line up in one row.
 */
export function computeSectionFramePosition(
  frames: SectionLayoutFrame[],
  annotations: SectionLayoutAnnotation[],
  pageId: string,
  sectionLabel: string
): {
  x: number;
  y: number;
  createLabels: Array<{text: string; x: number; y: number}>;
} {
  const text = String(sectionLabel || '').trim();
  const wanted = normalizeSectionLabel(text);
  const {sections} = groupFramesBySection(frames, annotations, pageId);

  const existing = sections.find(
    (section) => normalizeSectionLabel(section.label.text) === wanted
  );
  if (existing) {
    let x = existing.label.x;
    if (existing.frames.length > 0) {
      const rightEdge = Math.max(
        ...existing.frames.map((frame) => frame.x + Math.max(1, frame.width))
      );
      x = rightEdge + FRAME_AUTO_LAYOUT_GAP;
    }
    return {
      x: Math.round(x),
      y: Math.round(existing.label.y + SECTION_LABEL_GAP),
      createLabels: [],
    };
  }

  const pageFrames = frames.filter((frame) => frame.pageId === pageId);
  const createLabels: Array<{text: string; x: number; y: number}> = [];
  let labelX = 0;
  let labelY = 0;
  if (pageFrames.length > 0 || sections.length > 0) {
    // Empty sections count too, so a new row never lands on an older label.
    const lefts = [
      ...pageFrames.map((frame) => frame.x),
      ...(pageFrames.length === 0 ? sections.map((s) => s.label.x) : []),
    ];
    const bottoms = [
      ...pageFrames.map(
        (frame) =>
          frame.y + (frame.cachedHeight || SECTION_ESTIMATED_FRAME_HEIGHT)
      ),
      ...sections.map((s) => s.label.y + SECTION_LABEL_GAP),
    ];
    labelX = Math.round(Math.min(...lefts));
    labelY = Math.round(Math.max(...bottoms) + SECTION_ROW_GAP);
  }
  if (
    pageFrames.length > 0 &&
    sections.length === 0 &&
    wanted !== normalizeSectionLabel(DEFAULT_FIRST_SECTION_LABEL)
  ) {
    createLabels.push({
      text: DEFAULT_FIRST_SECTION_LABEL,
      x: labelX,
      y: Math.round(
        Math.min(...pageFrames.map((frame) => frame.y)) - SECTION_LABEL_GAP
      ),
    });
  }
  createLabels.push({text, x: labelX, y: labelY});
  return {x: labelX, y: labelY + SECTION_LABEL_GAP, createLabels};
}

/** Compact summary of an existing site schema discovered from the project. */
export interface SiteSchemaSummary {
  /** Schema identifier, e.g. `TemplateHero`. */
  name: string;
  /** Human-readable label, e.g. `Hero`. */
  label: string;
  /** Schema description, if defined. */
  description?: string;
  /** Top-level field summaries for fallback wireframing and AI grounding. */
  fields: Array<{
    id: string;
    label?: string;
    type: string;
    help?: string;
  }>;
  /** Preset names defined on the schema, if any. */
  presets?: string[];
}

/** Read-only project reference context returned by `/cms/api/prototypes.context`. */
export interface PrototypeProjectContext {
  /** Project name from `root.config.ts`. */
  projectName: string;
  /** Compact summaries of existing non-collection component schemas. */
  schemas: SiteSchemaSummary[];
  /** Extracted default brand theme tokens for new boards. */
  defaultTheme: PrototypeTheme;
  /** Optional `ROOT.md` instructions excerpt. */
  rootMdExcerpt?: string;
  /** Optional bounded style/token file excerpts (`styles/**`). */
  styleExcerpts?: Array<{path: string; content: string}>;
  /** Optional per-component source excerpts keyed by schema name. */
  componentSources?: Record<string, Array<{path: string; content: string}>>;
}

/** 2D camera state for the infinite pan/zoom artboard. */
export interface CanvasCamera {
  /** Horizontal translation in screen px. */
  x: number;
  /** Vertical translation in screen px. */
  y: number;
  /** Zoom scale factor, clamped to `[MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM]`. */
  zoom: number;
}

/** Minimum allowed artboard zoom scale (10%). */
export const MIN_CANVAS_ZOOM = 0.1;

/** Maximum allowed artboard zoom scale (250%). */
export const MAX_CANVAS_ZOOM = 2.5;

/** Clamps a zoom factor to `[MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM]`. */
export function clampCanvasZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return 1;
  }
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, zoom));
}

/**
 * Computes the next camera state when zooming around a screen-space anchor
 * point `(anchorX, anchorY)` relative to the canvas viewport's top-left corner,
 * keeping the world coordinate underneath the cursor stationary.
 */
export function zoomCameraAroundPoint(
  camera: CanvasCamera,
  nextZoom: number,
  anchorX: number,
  anchorY: number
): CanvasCamera {
  const clamped = clampCanvasZoom(nextZoom);
  const ratio = clamped / camera.zoom;
  return {
    x: anchorX - (anchorX - camera.x) * ratio,
    y: anchorY - (anchorY - camera.y) * ratio,
    zoom: clamped,
  };
}

/**
 * Computes a camera state that fits the given bounding boxes inside a viewport
 * of `(viewportWidth, viewportHeight)` with `padding` px on each side.
 */
export function fitCameraToBounds(
  boxes: Array<{x: number; y: number; width: number; height: number}>,
  viewportWidth: number,
  viewportHeight: number,
  padding = 64
): CanvasCamera {
  if (boxes.length === 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return {x: padding, y: padding, zoom: 0.65};
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + Math.max(200, box.height));
  }
  const contentWidth = Math.max(1, maxX - minX);
  const contentHeight = Math.max(1, maxY - minY);
  const availW = Math.max(100, viewportWidth - padding * 2);
  const availH = Math.max(100, viewportHeight - padding * 2);
  const zoom = clampCanvasZoom(
    Math.min(1, availW / contentWidth, availH / contentHeight)
  );
  const x = Math.round((viewportWidth - contentWidth * zoom) / 2 - minX * zoom);
  const y = Math.round(
    Math.max(padding, (viewportHeight - contentHeight * zoom) / 2) - minY * zoom
  );
  return {x, y, zoom};
}

/** Returns ordered `[key, block]` pairs from a `PrototypeBlockMap`. */
export function getOrderedBlocks(
  blocks: PrototypeBlockMap | undefined | null
): Array<{key: string; block: PrototypeBlock}> {
  if (!blocks || !Array.isArray(blocks._array)) {
    return [];
  }
  const result: Array<{key: string; block: PrototypeBlock}> = [];
  for (const key of blocks._array) {
    const entry = blocks[key];
    if (entry && !Array.isArray(entry) && typeof entry === 'object') {
      result.push({key, block: entry as PrototypeBlock});
    }
  }
  return result;
}

/** Measured bounding box of a rendered block reported by `prototype-runtime.js`. */
export interface PrototypeBlockRect {
  /** Block key inside `frame.blocks`. */
  blockKey: string;
  /** Offset from top of frame in unscaled CSS px. */
  top: number;
  /** Offset from left of frame in unscaled CSS px. */
  left: number;
  /** Width in unscaled CSS px. */
  width: number;
  /** Height in unscaled CSS px. */
  height: number;
}

/**
 * Unsafe CSS value tokens stripped from inline styles, scoped stylesheets and
 * theme tokens. Backslashes are rejected because CSS escapes (`\75rl(`) would
 * otherwise spell a blocked token.
 */
export const UNSAFE_CSS_VALUE_RE =
  /(?:url\s*\(|image-set\s*\(|expression\s*\(|@import\b|javascript\s*:|vbscript\s*:|behavior\s*:|-moz-binding\s*:|<\/style|\\)/i;

/**
 * Matches CSS viewport-relative block units (`vh`, `dvh`, `svh`, `lvh`, `vb`,
 * `vmax`, `vmin` and their dynamic variants), including leading-dot decimals.
 * Inside an auto-height frame these would resolve against the frame's own
 * height and grow without bound.
 */
export const VIEWPORT_UNIT_RE =
  /(?<![a-zA-Z0-9_-])(\d*\.?\d+)[dsl]?v(?:h|b|max|min)\b/gi;

/** Rewrites viewport-relative block units to `calc(N * var(--proto-vh, 9px))`. */
export function rewriteViewportUnits(css: string): string {
  return css.replace(VIEWPORT_UNIT_RE, 'calc($1 * var(--proto-vh, 9px))');
}

/**
 * Sanitizes a single theme token value before it is interpolated into CSS.
 * Returns `fallback` when the value could close the declaration, open a new
 * rule or reference an external resource.
 */
export function sanitizePrototypeThemeValue(
  value: string | undefined,
  fallback: string
): string {
  if (!value || typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (
    !trimmed ||
    /[;{}<>\r\n]/.test(trimmed) ||
    UNSAFE_CSS_VALUE_RE.test(trimmed)
  ) {
    return fallback;
  }
  return trimmed;
}

/**
 * Builds the frame CSP `img-src` directive. Frames hold AI-authored markup, so
 * images are limited to inline data and the project's own asset hosts: an
 * arbitrary `https:` image URL would let a block send data to any server.
 *
 * `storage.googleapis.com` is shared by every bucket, so it is allowed only
 * under the project's bucket path.
 */
export function buildPrototypeImgSrc(storageBucket?: string): string {
  const sources = ['data:', 'blob:', 'https://lh3.googleusercontent.com'];
  const bucket = String(storageBucket || '').trim();
  if (/^[a-z0-9][a-z0-9._-]{1,220}$/.test(bucket)) {
    sources.push(
      `https://storage.googleapis.com/${bucket}/`,
      `https://firebasestorage.googleapis.com/v0/b/${bucket}/`
    );
  }
  return `img-src ${sources.join(' ')}`;
}
