/**
 * Client-side implementations of the Google write tools declared in
 * `core/ai-tools-google.ts` (`gsheet_updateValues`, `gdoc_edit`, ...).
 *
 * Each tool has a preview (read-only; builds the diff shown on the approval
 * card) and an executor that applies the change with the signed-in user's own
 * Google access. The chat always asks the user to approve Google writes, even
 * in auto-apply mode, because they change files outside the CMS.
 *
 * Editing Docs and Slides and posting comments need the full `drive` scope,
 * which the user isn't asked for when they sign in to read files. The
 * executors request it right after the user clicks "Approve", while the click
 * still counts as a user gesture, so the Google consent popup isn't blocked.
 */
import {
  GoogleToolError,
  isGoogleWriteTool,
  throwGoogleAuthRequired,
  type GoogleAddCommentInput,
  type GoogleDocEditInput,
  type GoogleFileMeta,
  type GoogleReplyCommentInput,
  type GoogleSheetAppendRowsInput,
  type GoogleSheetCellValue,
  type GoogleSheetTab,
  type GoogleSheetUpdateValuesInput,
  type GoogleSlidesEditInput,
  type GoogleTextEditOperation,
  type GoogleWriteToolName,
} from '../../../../../core/ai-tools-google.js';
import {
  ensureGoogleAccessToken,
  GOOGLE_WRITE_SCOPES,
} from '../../../../integrations/google-auth.js';
import {
  DOC_MIME_TYPE,
  DOCS_API_ORIGIN,
  DRIVE_API_ORIGIN,
  fetchFileMetadata,
  fetchSheetMeta,
  fetchSheetTabs,
  googleFetch,
  quoteSheetTitle,
  requireFileRef,
  selectTab,
  shapeComment,
  shapeFileMeta,
  SHEETS_API_ORIGIN,
  SLIDES_API_ORIGIN,
  SLIDES_MIME_TYPE,
  type GoogleFetchOptions,
} from './clientGoogleTools.js';
import type {
  CmsToolDetail,
  CmsToolPreview,
  CmsToolReceipt,
} from './cmsToolHandlers.js';

/**
 * Options for requests that change a Doc, Slides deck or comment. Sheets
 * edits only need the `spreadsheets` scope granted at sign-in.
 */
const WRITE_FETCH: GoogleFetchOptions = {
  method: 'POST',
  extraScopes: GOOGLE_WRITE_SCOPES,
};

/** Approve button labels, per tool. */
const APPROVE_LABELS: Record<GoogleWriteToolName, string> = {
  gsheet_updateValues: 'Approve sheet edit',
  gsheet_appendRows: 'Approve sheet edit',
  gdoc_edit: 'Approve doc edit',
  gslides_edit: 'Approve slides edit',
  gdrive_addComment: 'Post comment',
  gdrive_replyComment: 'Post reply',
};

/** Approval card titles, per tool. */
const TITLES: Record<GoogleWriteToolName, string> = {
  gsheet_updateValues: 'Edit Google Sheet',
  gsheet_appendRows: 'Append rows to Google Sheet',
  gdoc_edit: 'Edit Google Doc',
  gslides_edit: 'Edit Google Slides',
  gdrive_addComment: 'Add Google comment',
  gdrive_replyComment: 'Reply to Google comment',
};

/** Builds the preview shown on the approval card for a Google write tool. */
export async function previewGoogleWriteTool(
  toolName: string,
  input: any
): Promise<CmsToolPreview> {
  if (!isGoogleWriteTool(toolName)) {
    throw new Error(`not a google write tool: ${toolName}`);
  }
  try {
    const preview = await buildPreview(toolName, input);
    return {
      toolName,
      title: TITLES[toolName],
      approveLabel: APPROVE_LABELS[toolName],
      ...preview,
    };
  } catch (err: any) {
    return {
      toolName,
      title: TITLES[toolName],
      summary: err?.message || String(err),
      details: [],
      error: err instanceof GoogleToolError ? err.code : 'PREVIEW_FAILED',
      hint: err instanceof GoogleToolError ? err.hint : undefined,
    };
  }
}

type PreviewBody = Pick<
  CmsToolPreview,
  'summary' | 'details' | 'before' | 'after'
>;

function buildPreview(
  toolName: GoogleWriteToolName,
  input: any
): Promise<PreviewBody> {
  switch (toolName) {
    case 'gsheet_updateValues':
      return previewSheetUpdate(input);
    case 'gsheet_appendRows':
      return previewSheetAppend(input);
    case 'gdoc_edit':
      return previewDocEdit(input);
    case 'gslides_edit':
      return previewSlidesEdit(input);
    case 'gdrive_addComment':
      return previewAddComment(input);
    case 'gdrive_replyComment':
      return previewReplyComment(input);
  }
}

/**
 * Applies an approved Google write tool call. Returns the tool output, or a
 * `{success: false, error, message}` object the model can relay to the user.
 */
export async function executeGoogleWriteTool(
  toolName: string,
  input: any
): Promise<unknown> {
  try {
    switch (toolName) {
      case 'gsheet_updateValues':
        return await executeSheetUpdate(input);
      case 'gsheet_appendRows':
        return await executeSheetAppend(input);
      case 'gdoc_edit':
        return await executeDocEdit(input);
      case 'gslides_edit':
        return await executeSlidesEdit(input);
      case 'gdrive_addComment':
        return await executeAddComment(input);
      case 'gdrive_replyComment':
        return await executeReplyComment(input);
      default:
        return {success: false, error: 'UNKNOWN_TOOL', toolName};
    }
  } catch (err: any) {
    if (err instanceof GoogleToolError) {
      return {
        success: false,
        error: err.code,
        message: err.message,
        ...(err.hint ? {hint: err.hint} : {}),
      };
    }
    console.error(`tool ${toolName} failed:`, err);
    return {
      success: false,
      error: 'GOOGLE_REQUEST_FAILED',
      message: err?.message || String(err),
    };
  }
}

/**
 * Makes sure the user granted write access, showing the Google consent popup
 * if needed. Must be the first await of an executor so the popup opens while
 * the user's "Approve" click still counts as a user gesture.
 */
async function requireWriteAccess(): Promise<void> {
  try {
    await ensureGoogleAccessToken({
      interactive: true,
      extraScopes: GOOGLE_WRITE_SCOPES,
    });
  } catch (err: any) {
    throwGoogleAuthRequired(
      `Permission to edit Google files was not granted${
        err?.message ? ` (${err.message})` : ''
      }.`
    );
  }
}

/** Throws a model-readable error for invalid tool input. */
function invalidInput(message: string, hint?: string): never {
  throw new GoogleToolError('GOOGLE_REQUEST_FAILED', message, {hint});
}

/** Builds a receipt that links to the edited Google file. */
function createReceipt(options: {
  title: string;
  summary: string;
  meta: GoogleFileMeta;
  linkLabel: string;
  url?: string;
  details?: CmsToolDetail[];
}): CmsToolReceipt {
  return {
    type: 'cms-write-receipt',
    title: options.title,
    summary: options.summary,
    adminUrl: options.url || options.meta.url,
    linkLabel: options.linkLabel,
    details: [
      {label: 'File', value: options.meta.name},
      ...(options.details || []),
    ],
  };
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

/** A cell position, with 0-based `row` and `col`. */
export interface CellPosition {
  row: number;
  col: number;
}

/** Converts a 0-based column index to letters (0 → "A", 26 → "AA"). */
export function columnToLetters(col: number): string {
  let letters = '';
  let n = col + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** Converts column letters to a 0-based column index ("A" → 0). */
export function lettersToColumn(letters: string): number {
  let col = 0;
  for (const ch of letters.toUpperCase()) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  return col - 1;
}

/** Formats a 0-based cell position as an A1 cell (e.g. "C5"). */
export function toA1Cell(pos: CellPosition): string {
  return `${columnToLetters(pos.col)}${pos.row + 1}`;
}

/**
 * Splits an A1 range into its tab title (if any) and the top-left cell of the
 * range. Accepts "C5", "B2:D4", "Sheet2!A10", "'Tab name'!A1:B2", plus
 * whole-column ("C:C", starts at row 1) and whole-row ("5:5", starts at
 * column A) ranges. Returns `null` when the range can't be parsed.
 */
export function parseA1Range(
  range: string
): {tab?: string; start: CellPosition} | null {
  const value = String(range || '').trim();
  const bang = value.lastIndexOf('!');
  let tab: string | undefined;
  let cells = value;
  if (bang >= 0) {
    const rawTab = value.slice(0, bang).trim();
    cells = value.slice(bang + 1).trim();
    tab =
      rawTab.startsWith("'") && rawTab.endsWith("'") && rawTab.length >= 2
        ? rawTab.slice(1, -1).replace(/''/g, "'")
        : rawTab;
    if (!tab) {
      return null;
    }
  }
  const startCell = cells.split(':')[0].replace(/\$/g, '');
  const match = startCell.match(/^([A-Za-z]{0,3})(\d*)$/);
  if (!match || (!match[1] && !match[2])) {
    return null;
  }
  const row = match[2] ? Number(match[2]) - 1 : 0;
  if (row < 0) {
    return null;
  }
  const col = match[1] ? lettersToColumn(match[1]) : 0;
  return {...(tab !== undefined ? {tab} : {}), start: {row, col}};
}

/** A sheet update resolved to an exact tab and range. */
export interface ResolvedSheetUpdate {
  tab: GoogleSheetTab;
  start: CellPosition;
  /** Exact A1 range covering `values`, including the quoted tab title. */
  range: string;
  values: GoogleSheetCellValue[][];
}

/**
 * Resolves each update's range against the spreadsheet's tabs. Ranges without
 * a tab name use `defaultTab`. The resolved range spans exactly the grid of
 * `values`, which is what the Sheets API expects when writing.
 */
export function resolveSheetUpdates(
  updates: GoogleSheetUpdateValuesInput['updates'],
  tabs: GoogleSheetTab[],
  defaultTab: GoogleSheetTab
): ResolvedSheetUpdate[] {
  return updates.map((update) => {
    const parsed = parseA1Range(update.range);
    if (!parsed) {
      invalidInput(
        `Invalid A1 range: "${update.range}".`,
        'Use A1 notation such as "B2", "B2:D4" or "\'Tab name\'!A1".'
      );
    }
    const tab = parsed.tab
      ? selectTab(tabs, parsed.tab, undefined)
      : defaultTab;
    const values = (update.values || []).map((row) => row || []);
    const width = Math.max(1, ...values.map((row) => row.length));
    const end = {
      row: parsed.start.row + Math.max(values.length, 1) - 1,
      col: parsed.start.col + width - 1,
    };
    return {
      tab,
      start: parsed.start,
      range: `${quoteSheetTitle(tab.title)}!${toA1Cell(parsed.start)}:${toA1Cell(end)}`,
      values,
    };
  });
}

/** A single cell that an update changes. */
export interface SheetCellChange {
  cell: string;
  before: string;
  after: string;
}

/** Formats a cell value the way it appears in a diff. */
function cellText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * Lists the cells the updates change, in tab/row/column order. `current[i]` is
 * the existing grid of `updates[i].range`. Cells written with their current
 * value are left out; when updates overlap, the later one wins.
 */
export function diffSheetUpdates(
  updates: ResolvedSheetUpdate[],
  current: unknown[][][]
): SheetCellChange[] {
  const changes = new Map<
    string,
    SheetCellChange & {tab: string; row: number; col: number}
  >();
  updates.forEach((update, i) => {
    const existing = current[i] || [];
    update.values.forEach((row, r) => {
      row.forEach((value, c) => {
        const pos = {row: update.start.row + r, col: update.start.col + c};
        const key = `${update.tab.gid}:${pos.row}:${pos.col}`;
        const prior = changes.get(key);
        changes.set(key, {
          tab: update.tab.title,
          row: pos.row,
          col: pos.col,
          cell: `${update.tab.title}!${toA1Cell(pos)}`,
          before: prior ? prior.before : cellText(existing[r]?.[c]),
          after: cellText(value),
        });
      });
    });
  });
  return Array.from(changes.values())
    .filter((change) => change.before !== change.after)
    .sort(
      (a, b) => a.tab.localeCompare(b.tab) || a.row - b.row || a.col - b.col
    )
    .map(({cell, before, after}) => ({cell, before, after}));
}

/** Renders cell changes as diffable text, one `Cell: "value"` per line. */
function formatCellLines(
  changes: SheetCellChange[],
  key: 'before' | 'after'
): string {
  return changes
    .map((change) => `${change.cell}: ${JSON.stringify(change[key])}`)
    .join('\n');
}

/** Loads a spreadsheet and resolves `input.updates` against its tabs. */
async function loadSheetUpdates(input: GoogleSheetUpdateValuesInput) {
  if (!Array.isArray(input?.updates) || input.updates.length === 0) {
    invalidInput('`updates` must list at least one range to write.');
  }
  const ref = requireFileRef(input.url);
  const meta = await fetchSheetMeta(ref.fileId);
  const tabs = await fetchSheetTabs(ref.fileId, meta.name);
  const defaultTab = selectTab(tabs, input.sheet, ref.gid);
  const updates = resolveSheetUpdates(input.updates, tabs, defaultTab);
  return {ref, meta, updates};
}

async function previewSheetUpdate(
  input: GoogleSheetUpdateValuesInput
): Promise<PreviewBody> {
  const {ref, meta, updates} = await loadSheetUpdates(input);
  const params = new URLSearchParams({
    majorDimension: 'ROWS',
    // Show formulas (not their results) so overwriting one is visible.
    valueRenderOption: 'FORMULA',
  });
  for (const update of updates) {
    params.append('ranges', update.range);
  }
  const res = await googleFetch(
    `${SHEETS_API_ORIGIN}/v4/spreadsheets/${encodeURIComponent(
      ref.fileId
    )}/values:batchGet?${params.toString()}`
  );
  const body = await res.json();
  const current: unknown[][][] = (body?.valueRanges || []).map(
    (valueRange: any) => valueRange?.values || []
  );
  const changes = diffSheetUpdates(updates, current);
  if (changes.length === 0) {
    throw new GoogleToolError(
      'GOOGLE_REQUEST_FAILED',
      'Every cell already has the requested value, so there is nothing to write.'
    );
  }
  const tabTitles = Array.from(new Set(updates.map((u) => u.tab.title)));
  return {
    summary: `Change ${changes.length} cell${
      changes.length === 1 ? '' : 's'
    } in "${meta.name}".`,
    details: [
      {label: 'Spreadsheet', value: meta.name},
      {
        label: tabTitles.length === 1 ? 'Tab' : 'Tabs',
        value: tabTitles.join(', '),
      },
      {label: 'Values', value: input.inputOption || 'RAW'},
    ],
    before: formatCellLines(changes, 'before'),
    after: formatCellLines(changes, 'after'),
  };
}

async function executeSheetUpdate(input: GoogleSheetUpdateValuesInput) {
  const {ref, meta, updates} = await loadSheetUpdates(input);
  const res = await googleFetch(
    `${SHEETS_API_ORIGIN}/v4/spreadsheets/${encodeURIComponent(
      ref.fileId
    )}/values:batchUpdate`,
    {
      method: 'POST',
      body: {
        valueInputOption: input.inputOption || 'RAW',
        data: updates.map((update) => ({
          range: update.range,
          majorDimension: 'ROWS',
          values: update.values,
        })),
      },
    }
  );
  const body = await res.json();
  const updatedCells = Number(body?.totalUpdatedCells || 0);
  const ranges = (body?.responses || [])
    .map((response: any) => response?.updatedRange)
    .filter(Boolean);
  return {
    success: true,
    updatedCells,
    updatedRanges: ranges,
    receipt: createReceipt({
      title: 'Updated Google Sheet',
      summary: `Wrote ${updatedCells} cell${updatedCells === 1 ? '' : 's'} in "${meta.name}".`,
      meta,
      url: sheetTabUrl(meta, updates[0].tab),
      linkLabel: 'Open in Google Sheets',
      details: [{label: 'Ranges', value: ranges.join(', ')}],
    }),
  };
}

/** Loads a spreadsheet and the tab `input.rows` are appended to. */
async function loadSheetAppend(input: GoogleSheetAppendRowsInput) {
  if (!Array.isArray(input?.rows) || input.rows.length === 0) {
    invalidInput('`rows` must list at least one row to append.');
  }
  const ref = requireFileRef(input.url);
  const meta = await fetchSheetMeta(ref.fileId);
  const tabs = await fetchSheetTabs(ref.fileId, meta.name);
  const tab = selectTab(tabs, input.sheet, ref.gid);
  return {ref, meta, tab};
}

async function previewSheetAppend(
  input: GoogleSheetAppendRowsInput
): Promise<PreviewBody> {
  const {meta, tab} = await loadSheetAppend(input);
  const count = input.rows.length;
  return {
    summary: `Append ${count} row${count === 1 ? '' : 's'} to "${tab.title}" in "${meta.name}".`,
    details: [
      {label: 'Spreadsheet', value: meta.name},
      {label: 'Tab', value: tab.title},
      {label: 'Values', value: input.inputOption || 'RAW'},
    ],
    before: '',
    after: input.rows
      .map((row) => JSON.stringify((row || []).map(cellText)))
      .join('\n'),
  };
}

async function executeSheetAppend(input: GoogleSheetAppendRowsInput) {
  const {ref, meta, tab} = await loadSheetAppend(input);
  const params = new URLSearchParams({
    valueInputOption: input.inputOption || 'RAW',
    insertDataOption: 'INSERT_ROWS',
  });
  const res = await googleFetch(
    `${SHEETS_API_ORIGIN}/v4/spreadsheets/${encodeURIComponent(
      ref.fileId
    )}/values/${encodeURIComponent(
      quoteSheetTitle(tab.title)
    )}:append?${params.toString()}`,
    {method: 'POST', body: {majorDimension: 'ROWS', values: input.rows}}
  );
  const body = await res.json();
  const updatedRange = String(body?.updates?.updatedRange || '');
  const count = input.rows.length;
  return {
    success: true,
    updatedRange,
    receipt: createReceipt({
      title: 'Appended rows to Google Sheet',
      summary: `Appended ${count} row${count === 1 ? '' : 's'} to "${tab.title}".`,
      meta,
      url: sheetTabUrl(meta, tab),
      linkLabel: 'Open in Google Sheets',
      details: updatedRange ? [{label: 'Range', value: updatedRange}] : [],
    }),
  };
}

/** Links to a specific tab of a spreadsheet. */
function sheetTabUrl(meta: GoogleFileMeta, tab: GoogleSheetTab): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
    meta.fileId
  )}/edit#gid=${tab.gid}`;
}

// ---------------------------------------------------------------------------
// Docs and Slides text edits
// ---------------------------------------------------------------------------

/** Escapes `text` for use in a RegExp. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replaces every occurrence of `find` in `text`, mirroring the Docs/Slides
 * `replaceAllText` request. Returns the new text and the number of matches.
 */
export function replaceAllText(
  text: string,
  find: string,
  replace: string,
  matchCase = true
): {text: string; count: number} {
  let count = 0;
  const re = new RegExp(escapeRegExp(find), matchCase ? 'g' : 'gi');
  const next = text.replace(re, () => {
    count += 1;
    return replace;
  });
  return {text: next, count};
}

/** Validates the text edit operations for `gdoc_edit` / `gslides_edit`. */
function validateTextOperations(
  operations: GoogleTextEditOperation[],
  allowAppend: boolean
) {
  if (!Array.isArray(operations) || operations.length === 0) {
    invalidInput('`operations` must list at least one edit.');
  }
  operations.forEach((op, i) => {
    if (op?.op === 'replace') {
      if (!op.find) {
        invalidInput(
          `Operation ${i + 1}: "replace" needs a non-empty \`find\`.`
        );
      }
      if (typeof op.replace !== 'string') {
        invalidInput(
          `Operation ${i + 1}: "replace" needs \`replace\` (use "" to delete the text).`
        );
      }
    } else if (op?.op === 'append' && allowAppend) {
      if (!op.text) {
        invalidInput(`Operation ${i + 1}: "append" needs non-empty \`text\`.`);
      }
    } else {
      invalidInput(`Operation ${i + 1}: unsupported op "${op?.op}".`);
    }
  });
}

/** Throws when a replace operation matched nothing in the file. */
function throwNoMatch(find: string, toolName: string): never {
  throw new GoogleToolError(
    'GOOGLE_NOT_FOUND',
    `The text "${find}" was not found, so nothing would change.`,
    {
      hint:
        `Read the file again with \`${toolName}\` and copy the text ` +
        'verbatim, without markdown syntax (e.g. **, # or list markers). ' +
        'Matches cannot span paragraphs.',
    }
  );
}

/**
 * The text of a Google Doc, split into segments (each tab's body, headers,
 * footers and footnotes) of paragraphs. `replaceAllText` never matches across
 * paragraphs, so previews match paragraph by paragraph.
 */
export function extractDocParagraphs(document: any): string[][] {
  const segments: string[][] = [];
  const addContent = (content: any[] | undefined) => {
    const paragraphs: string[] = [];
    collectParagraphs(content, paragraphs);
    if (paragraphs.length > 0) {
      segments.push(paragraphs);
    }
  };
  const addDocumentTab = (tab: any) => {
    addContent(tab?.body?.content);
    for (const group of [tab?.headers, tab?.footers, tab?.footnotes]) {
      for (const segment of Object.values(group || {})) {
        addContent((segment as any)?.content);
      }
    }
  };
  const visitTabs = (tabs: any[]) => {
    for (const tab of tabs || []) {
      addDocumentTab(tab?.documentTab);
      visitTabs(tab?.childTabs);
    }
  };
  if (Array.isArray(document?.tabs) && document.tabs.length > 0) {
    visitTabs(document.tabs);
  } else {
    addDocumentTab(document);
  }
  return segments;
}

function collectParagraphs(content: any[] | undefined, out: string[]) {
  for (const element of content || []) {
    if (element?.paragraph) {
      out.push(
        (element.paragraph.elements || [])
          .map((el: any) => el?.textRun?.content || '')
          .join('')
      );
    } else if (element?.table) {
      for (const row of element.table.tableRows || []) {
        for (const cell of row?.tableCells || []) {
          collectParagraphs(cell?.content, out);
        }
      }
    }
  }
}

/**
 * Applies text edit operations to the paragraphs of a file, returning the new
 * paragraphs and the match count of each operation. "append" adds paragraphs
 * to the end of the first segment (the doc body).
 */
export function simulateTextEdits(
  segments: string[][],
  operations: GoogleTextEditOperation[]
): {segments: string[][]; counts: number[]} {
  const next = segments.map((paragraphs) => [...paragraphs]);
  const counts = operations.map((op) => {
    if (op.op === 'append') {
      if (next.length === 0) {
        next.push([]);
      }
      next[0].push(...`${op.text}\n`.split(/(?<=\n)/));
      return 0;
    }
    let count = 0;
    for (const paragraphs of next) {
      paragraphs.forEach((paragraph, i) => {
        const result = replaceAllText(
          paragraph,
          op.find!,
          op.replace!,
          op.matchCase !== false
        );
        paragraphs[i] = result.text;
        count += result.count;
      });
    }
    return count;
  });
  return {segments: next, counts};
}

/** Joins segments of paragraphs into diffable text. */
function segmentsToText(segments: string[][]): string {
  return segments.map((paragraphs) => paragraphs.join('')).join('\n');
}

/** Summarizes text edit operations for the approval card. */
function describeTextOperations(
  operations: GoogleTextEditOperation[],
  counts: number[]
): CmsToolDetail[] {
  return operations.map((op, i) => ({
    label: `Edit ${i + 1}`,
    value:
      op.op === 'append'
        ? 'Append text'
        : `Replace ${counts[i]} match${counts[i] === 1 ? '' : 'es'} of "${truncateText(op.find!, 60)}"`,
  }));
}

function truncateText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Loads a Google Doc's metadata and structure. */
async function loadDoc(url: string) {
  const ref = requireFileRef(url);
  const meta = shapeFileMeta(await fetchFileMetadata(ref.fileId));
  if (meta.mimeType !== DOC_MIME_TYPE) {
    throw new GoogleToolError(
      'GOOGLE_UNSUPPORTED_FILE',
      `"${meta.name}" is not a Google Doc (${meta.mimeType}).`
    );
  }
  const res = await googleFetch(
    `${DOCS_API_ORIGIN}/v1/documents/${encodeURIComponent(
      ref.fileId
    )}?includeTabsContent=true`
  );
  return {ref, meta, document: await res.json()};
}

async function previewDocEdit(input: GoogleDocEditInput): Promise<PreviewBody> {
  validateTextOperations(input?.operations, true);
  const {meta, document} = await loadDoc(input.url);
  const before = extractDocParagraphs(document);
  const {segments, counts} = simulateTextEdits(before, input.operations);
  input.operations.forEach((op, i) => {
    if (op.op === 'replace' && counts[i] === 0) {
      throwNoMatch(op.find!, 'gdoc_get');
    }
  });
  return {
    summary: `Apply ${input.operations.length} edit${
      input.operations.length === 1 ? '' : 's'
    } to "${meta.name}".`,
    details: [
      {label: 'Document', value: meta.name},
      ...describeTextOperations(input.operations, counts),
    ],
    before: segmentsToText(before),
    after: segmentsToText(segments),
  };
}

async function executeDocEdit(input: GoogleDocEditInput) {
  validateTextOperations(input?.operations, true);
  await requireWriteAccess();
  const ref = requireFileRef(input.url);
  const meta = shapeFileMeta(await fetchFileMetadata(ref.fileId));
  const requests = input.operations.map((op) =>
    op.op === 'append'
      ? {insertText: {text: `\n${op.text}`, endOfSegmentLocation: {}}}
      : {
          replaceAllText: {
            containsText: {text: op.find, matchCase: op.matchCase !== false},
            replaceText: op.replace,
          },
        }
  );
  const res = await googleFetch(
    `${DOCS_API_ORIGIN}/v1/documents/${encodeURIComponent(
      ref.fileId
    )}:batchUpdate`,
    {...WRITE_FETCH, body: {requests}}
  );
  const body = await res.json();
  const occurrences = getOccurrencesChanged(body);
  return {
    success: true,
    occurrencesChanged: occurrences,
    receipt: createReceipt({
      title: 'Edited Google Doc',
      summary: `Applied ${requests.length} edit${requests.length === 1 ? '' : 's'} to "${meta.name}".`,
      meta,
      linkLabel: 'Open in Google Docs',
      details: [{label: 'Replacements', value: String(occurrences)}],
    }),
  };
}

/** Sums `occurrencesChanged` over a Docs/Slides batchUpdate response. */
function getOccurrencesChanged(body: any): number {
  return (body?.replies || []).reduce(
    (sum: number, reply: any) =>
      sum + Number(reply?.replaceAllText?.occurrencesChanged || 0),
    0
  );
}

/** One slide's text, split per shape or table cell (matches can't span). */
export interface SlideText {
  objectId: string;
  texts: string[];
}

/** Extracts the raw text of each slide, as `replaceAllText` sees it. */
export function extractSlideTexts(presentation: any): SlideText[] {
  return (presentation?.slides || []).map((slide: any) => {
    const texts: string[] = [];
    collectSlideTexts(slide?.pageElements, texts);
    return {objectId: String(slide?.objectId || ''), texts};
  });
}

function collectSlideTexts(elements: any[] | undefined, out: string[]) {
  const textOf = (textContent: any) =>
    (textContent?.textElements || [])
      .map((el: any) => el?.textRun?.content || '')
      .join('');
  for (const element of elements || []) {
    if (element?.shape?.text) {
      out.push(textOf(element.shape.text));
    } else if (element?.table) {
      for (const row of element.table.tableRows || []) {
        for (const cell of row?.tableCells || []) {
          if (cell?.text) {
            out.push(textOf(cell.text));
          }
        }
      }
    } else if (element?.elementGroup) {
      collectSlideTexts(element.elementGroup.children, out);
    }
  }
}

/** Renders slide texts as diffable text. */
function slidesToText(slides: SlideText[]): string {
  return slides
    .map((slide, i) =>
      [
        `--- Slide ${i + 1} (${slide.objectId}) ---`,
        ...slide.texts
          .map((text) => text.split('\u000b').join('\n').trimEnd())
          .filter(Boolean),
      ].join('\n')
    )
    .join('\n\n');
}

/** Loads a Slides deck's metadata and the raw text of each slide. */
async function loadSlides(url: string) {
  const ref = requireFileRef(url);
  const meta = shapeFileMeta(await fetchFileMetadata(ref.fileId));
  if (meta.mimeType !== SLIDES_MIME_TYPE) {
    throw new GoogleToolError(
      'GOOGLE_UNSUPPORTED_FILE',
      `"${meta.name}" is not a Google Slides presentation (${meta.mimeType}).`
    );
  }
  const res = await googleFetch(
    `${SLIDES_API_ORIGIN}/v1/presentations/${encodeURIComponent(
      ref.fileId
    )}?fields=${encodeURIComponent('slides(objectId,pageElements)')}`
  );
  return {ref, meta, slides: extractSlideTexts(await res.json())};
}

/** Returns the slide ids an operation targets, validating `slideIds`. */
function getTargetSlideIds(
  op: GoogleTextEditOperation,
  slides: SlideText[]
): string[] {
  const allIds = slides.map((slide) => slide.objectId);
  if (!op.slideIds || op.slideIds.length === 0) {
    return allIds;
  }
  const unknown = op.slideIds.filter((id) => !allIds.includes(id));
  if (unknown.length > 0) {
    throw new GoogleToolError(
      'GOOGLE_NOT_FOUND',
      `Unknown slide id(s): ${unknown.join(', ')}.`,
      {hint: 'Use the slide `objectId`s returned by `gslides_get`.'}
    );
  }
  return op.slideIds;
}

/**
 * Applies replace operations to slide texts, returning the new texts and the
 * match count of each operation.
 */
export function simulateSlidesEdits(
  slides: SlideText[],
  operations: GoogleTextEditOperation[]
): {slides: SlideText[]; counts: number[]} {
  const next = slides.map((slide) => ({...slide, texts: [...slide.texts]}));
  const counts = operations.map((op) => {
    const targets = getTargetSlideIds(op, slides);
    let count = 0;
    for (const slide of next) {
      if (!targets.includes(slide.objectId)) {
        continue;
      }
      slide.texts = slide.texts.map((text) => {
        const result = replaceAllText(
          text,
          op.find!,
          op.replace!,
          op.matchCase !== false
        );
        count += result.count;
        return result.text;
      });
    }
    return count;
  });
  return {slides: next, counts};
}

async function previewSlidesEdit(
  input: GoogleSlidesEditInput
): Promise<PreviewBody> {
  validateTextOperations(input?.operations, false);
  const {meta, slides} = await loadSlides(input.url);
  const result = simulateSlidesEdits(slides, input.operations);
  input.operations.forEach((op, i) => {
    if (result.counts[i] === 0) {
      throwNoMatch(op.find!, 'gslides_get');
    }
  });
  return {
    summary: `Apply ${input.operations.length} edit${
      input.operations.length === 1 ? '' : 's'
    } to "${meta.name}".`,
    details: [
      {label: 'Presentation', value: meta.name},
      ...describeTextOperations(input.operations, result.counts),
    ],
    before: slidesToText(slides),
    after: slidesToText(result.slides),
  };
}

async function executeSlidesEdit(input: GoogleSlidesEditInput) {
  validateTextOperations(input?.operations, false);
  await requireWriteAccess();
  const {ref, meta, slides} = await loadSlides(input.url);
  const requests = input.operations.map((op) => ({
    replaceAllText: {
      containsText: {text: op.find, matchCase: op.matchCase !== false},
      replaceText: op.replace,
      // Always scope to slides so layouts, masters and notes are untouched.
      pageObjectIds: getTargetSlideIds(op, slides),
    },
  }));
  const res = await googleFetch(
    `${SLIDES_API_ORIGIN}/v1/presentations/${encodeURIComponent(
      ref.fileId
    )}:batchUpdate`,
    {...WRITE_FETCH, body: {requests}}
  );
  const body = await res.json();
  const occurrences = getOccurrencesChanged(body);
  return {
    success: true,
    occurrencesChanged: occurrences,
    receipt: createReceipt({
      title: 'Edited Google Slides',
      summary: `Applied ${requests.length} edit${requests.length === 1 ? '' : 's'} to "${meta.name}".`,
      meta,
      linkLabel: 'Open in Google Slides',
      details: [{label: 'Replacements', value: String(occurrences)}],
    }),
  };
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/** Drive API fields returned for a created comment or reply. */
const CREATED_COMMENT_FIELDS = 'id,content,createdTime';

/** Loads the metadata of the file a comment is posted on. */
async function loadCommentFile(url: string): Promise<GoogleFileMeta> {
  const ref = requireFileRef(url);
  return shapeFileMeta(await fetchFileMetadata(ref.fileId));
}

async function previewAddComment(
  input: GoogleAddCommentInput
): Promise<PreviewBody> {
  if (!input?.content?.trim()) {
    invalidInput('`content` must not be empty.');
  }
  const meta = await loadCommentFile(input.url);
  return {
    summary: `Post a comment on "${meta.name}" as you.`,
    details: [
      {label: 'File', value: meta.name},
      {label: 'Comment', value: input.content},
    ],
  };
}

async function executeAddComment(input: GoogleAddCommentInput) {
  await requireWriteAccess();
  const meta = await loadCommentFile(input.url);
  const res = await googleFetch(
    `${DRIVE_API_ORIGIN}/drive/v3/files/${encodeURIComponent(
      meta.fileId
    )}/comments?fields=${encodeURIComponent(CREATED_COMMENT_FIELDS)}`,
    {...WRITE_FETCH, body: {content: input.content}}
  );
  const body = await res.json();
  return {
    success: true,
    commentId: body?.id,
    receipt: createReceipt({
      title: 'Posted Google comment',
      summary: `Commented on "${meta.name}".`,
      meta,
      linkLabel: 'Open file',
    }),
  };
}

/** Validates a reply and loads the comment it replies to. */
async function loadReplyTarget(input: GoogleReplyCommentInput) {
  if (!input?.commentId) {
    invalidInput(
      '`commentId` is required.',
      'Get it from `gdrive_listComments`.'
    );
  }
  if (!input.content?.trim() && !input.action) {
    invalidInput('Pass a reply `content`, an `action`, or both.');
  }
  const meta = await loadCommentFile(input.url);
  try {
    const res = await googleFetch(
      `${DRIVE_API_ORIGIN}/drive/v3/files/${encodeURIComponent(
        meta.fileId
      )}/comments/${encodeURIComponent(input.commentId)}?fields=${encodeURIComponent(
        'id,content,author(displayName,emailAddress),resolved,quotedFileContent(value)'
      )}`
    );
    return {meta, comment: shapeComment(await res.json())};
  } catch (err) {
    if (err instanceof GoogleToolError && err.code === 'GOOGLE_NOT_FOUND') {
      throw new GoogleToolError(
        'GOOGLE_NOT_FOUND',
        `No comment with id "${input.commentId}" on "${meta.name}".`,
        {hint: 'Get the comment id from `gdrive_listComments`.'}
      );
    }
    throw err;
  }
}

async function previewReplyComment(
  input: GoogleReplyCommentInput
): Promise<PreviewBody> {
  const {meta, comment} = await loadReplyTarget(input);
  const details: CmsToolDetail[] = [
    {label: 'File', value: meta.name},
    {
      label: 'Comment',
      value: `${comment.author ? `${comment.author}: ` : ''}${truncateText(
        comment.content,
        200
      )}`,
    },
  ];
  if (input.content?.trim()) {
    details.push({label: 'Reply', value: input.content});
  }
  if (input.action) {
    details.push({
      label: 'Action',
      value: input.action === 'resolve' ? 'Resolve' : 'Reopen',
    });
  }
  return {
    summary: `${
      input.content?.trim()
        ? 'Reply to'
        : input.action === 'resolve'
          ? 'Resolve'
          : 'Reopen'
    } a comment on "${meta.name}" as you.`,
    details,
  };
}

async function executeReplyComment(input: GoogleReplyCommentInput) {
  await requireWriteAccess();
  const {meta} = await loadReplyTarget(input);
  const res = await googleFetch(
    `${DRIVE_API_ORIGIN}/drive/v3/files/${encodeURIComponent(
      meta.fileId
    )}/comments/${encodeURIComponent(
      input.commentId
    )}/replies?fields=${encodeURIComponent('id,content,action')}`,
    {
      ...WRITE_FETCH,
      body: {
        ...(input.content?.trim() ? {content: input.content} : {}),
        ...(input.action ? {action: input.action} : {}),
      },
    }
  );
  const body = await res.json();
  return {
    success: true,
    replyId: body?.id,
    receipt: createReceipt({
      title: 'Posted Google comment reply',
      summary: input.action
        ? `${input.action === 'resolve' ? 'Resolved' : 'Reopened'} a comment on "${meta.name}".`
        : `Replied to a comment on "${meta.name}".`,
      meta,
      linkLabel: 'Open file',
    }),
  };
}
