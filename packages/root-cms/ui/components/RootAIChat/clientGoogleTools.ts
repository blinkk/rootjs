/**
 * Browser-side backend for the Root AI Google tools (`core/ai-tools-google.ts`).
 *
 * Calls the Drive, Sheets and Slides REST APIs directly with the signed-in user's own
 * OAuth token (see `ui/utils/google-auth.ts`), so the model can only read
 * files the user personally has access to and no Google credential is ever
 * stored server-side. The REST APIs are used instead of `gapi.client` so the
 * tools work on pages that never loaded the gapi script. The write tools'
 * handlers (`googleToolHandlers.ts`) reuse the same fetch helpers.
 *
 * The tool set is empty unless the project configured
 * `gapi: {apiKey, clientId}` on the cmsPlugin.
 */
import type {ToolSet, UIMessage} from 'ai';
import {
  createGoogleTools,
  createGoogleWriteTools,
  GOOGLE_TOOL_NAMES,
  isGoogleWriteTool,
  GoogleToolError,
  throwGoogleAuthRequired,
  type GoogleComment,
  type GoogleCommentsContent,
  DEFAULT_MAX_COMMENTS,
  type GoogleDocContent,
  type GoogleDocSuggestionsContent,
  type GoogleDocSuggestionsView,
  type GoogleDriveFileContent,
  type GoogleFileMeta,
  type GoogleSheetContent,
  type GoogleSheetTab,
  type GoogleSlide,
  type GoogleSlidesContent,
  type GoogleToolBackend,
} from '../../../core/ai-tools-google.js';
import {parseGoogleDriveId} from '../../utils/gdrive.js';
import {
  clearGoogleAccessToken,
  ensureGoogleAccessToken,
  getGoogleAccessToken,
  GOOGLE_WRITE_SCOPES,
  isGoogleApiEnabled,
} from '../../utils/google-auth.js';
import {
  extractDocSuggestions,
  renderDocMarkdown,
} from './googleDocSuggestions.js';

export const DRIVE_API_ORIGIN = 'https://www.googleapis.com';
export const SHEETS_API_ORIGIN = 'https://sheets.googleapis.com';
export const SLIDES_API_ORIGIN = 'https://slides.googleapis.com';
export const DOCS_API_ORIGIN = 'https://docs.googleapis.com';

export const DOC_MIME_TYPE = 'application/vnd.google-apps.document';
export const SHEET_MIME_TYPE = 'application/vnd.google-apps.spreadsheet';
export const SLIDES_MIME_TYPE = 'application/vnd.google-apps.presentation';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

/** Drive file fields requested for every file read. */
const FILE_FIELDS = 'id,name,mimeType,modifiedTime,size,webViewLink';

/**
 * Slides API fields requested by `gslides_get`: each slide's page elements
 * plus its speaker notes page.
 */
const SLIDES_FIELDS =
  'slides(objectId,pageElements,slideProperties(isSkipped,notesPage(notesProperties,pageElements)))';

/** Placeholder types treated as a slide's title. */
const TITLE_PLACEHOLDER_TYPES = ['TITLE', 'CENTERED_TITLE'];

/** Non-`text/*` mime types that can still be read as text. */
const TEXT_MIME_TYPES = [
  'application/json',
  'application/xml',
  'application/x-ndjson',
  'application/javascript',
  'application/rtf',
];

/** Largest file the tools will download to read as text. */
const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;

/** A Drive file reference parsed out of a URL or a bare file id. */
export interface GoogleFileRef {
  fileId: string;
  /** Spreadsheet tab id, when the URL pointed at a specific tab. */
  gid?: number;
  /** Slide object id, when the URL pointed at a specific slide. */
  slideId?: string;
}

/**
 * Parses a Google Drive/Docs/Sheets URL or a bare Drive file id into a file
 * reference. Returns `null` if `input` is neither.
 */
export function parseGoogleFileRef(input: string): GoogleFileRef | null {
  const value = String(input || '')
    .trim()
    .replace(/^<|>$/g, '');
  if (!value) {
    return null;
  }
  if (!value.includes('/') && /^[A-Za-z0-9_-]{10,}$/.test(value)) {
    return {fileId: value};
  }
  const fileId = parseGoogleDriveId(value);
  if (!fileId) {
    return null;
  }
  const ref: GoogleFileRef = {fileId};
  const gid = parseGid(value);
  if (gid !== null) {
    ref.gid = gid;
  }
  const slideId = parseSlideId(value);
  if (slideId) {
    ref.slideId = slideId;
  }
  return ref;
}

/** Extracts the `gid` (spreadsheet tab id) from a URL hash or query param. */
function parseGid(url: string): number | null {
  const match = url.match(/[#?&]gid=(\d+)/);
  if (!match) {
    return null;
  }
  const gid = Number(match[1]);
  return Number.isFinite(gid) ? gid : null;
}

/** Extracts the slide object id from a `#slide=id.<objectId>` URL hash. */
function parseSlideId(url: string): string | null {
  const match = url.match(/[#?&]slide=id\.([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

/** Parses a file ref, throwing a model-readable error on bad input. */
export function requireFileRef(input: string): GoogleFileRef {
  const ref = parseGoogleFileRef(input);
  if (!ref) {
    throw new GoogleToolError(
      'GOOGLE_INVALID_URL',
      `Not a Google Drive URL or file id: ${input}`,
      {hint: 'Ask the user for the full Google Drive/Docs/Sheets link.'}
    );
  }
  return ref;
}

/** Options for `googleFetch`. */
export interface GoogleFetchOptions {
  method?: 'GET' | 'POST' | 'PUT';
  /** JSON request body. */
  body?: unknown;
  /** Scopes needed beyond the sign-in scopes (e.g. write access). */
  extraScopes?: string[];
  /**
   * Whether the Google sign-in popup may be shown. Only pass `true` while
   * handling a user gesture (e.g. right after the user clicked "Approve").
   */
  interactive?: boolean;
}

/** Returns an access token, mapping "not signed in" to an auth tool error. */
async function requireAccessToken(
  options: GoogleFetchOptions
): Promise<string> {
  try {
    return await ensureGoogleAccessToken({
      interactive: options.interactive,
      extraScopes: options.extraScopes,
    });
  } catch (err: any) {
    throwGoogleAuthRequired(
      err?.message || 'The user has not granted Google access yet.'
    );
  }
}

/**
 * Calls a Google API with the user's token, mapping HTTP failures to
 * `GoogleToolError`. A 401 clears the cached token and retries once, which
 * covers a token that expired mid-chat.
 */
export async function googleFetch(
  url: string,
  options: GoogleFetchOptions = {},
  retryOn401 = true
): Promise<Response> {
  const token = await requireAccessToken(options);
  const headers: Record<string, string> = {Authorization: `Bearer ${token}`};
  const init: RequestInit = {headers};
  if (options.method) {
    init.method = options.method;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, init);
  if (res.ok) {
    return res;
  }
  const body = await res
    .clone()
    .json()
    .catch(() => ({}) as any);
  if (res.status === 401) {
    clearGoogleAccessToken();
    if (retryOn401) {
      return await googleFetch(url, options, false);
    }
    throwGoogleAuthRequired('The Google sign-in session has expired.');
  }
  const reason = String(
    body?.error?.errors?.[0]?.reason || body?.error?.status || ''
  ).toLowerCase();
  if (res.status === 403 && isApiDisabledError(body)) {
    throw new GoogleToolError(
      'GOOGLE_NOT_CONFIGURED',
      `A Google API needed to read this file is not enabled for the CMS's Google Cloud project${
        body?.error?.message ? `: ${body.error.message}` : '.'
      }`,
      {
        hint: 'Tell the user a CMS admin needs to enable the API in the Google Cloud console.',
      }
    );
  }
  if (
    res.status === 429 ||
    (res.status === 403 &&
      (reason.includes('ratelimit') || reason.includes('resource_exhausted')))
  ) {
    throw new GoogleToolError(
      'GOOGLE_RATE_LIMITED',
      'Google is rate-limiting API requests for this account. Wait a minute and try again.'
    );
  }
  if (res.status === 403) {
    const write = options.method && options.method !== 'GET';
    throw new GoogleToolError(
      'GOOGLE_PERMISSION_DENIED',
      write
        ? "The signed-in Google account can't edit or comment on this file."
        : "The signed-in Google account doesn't have access to this file.",
      {
        hint: write
          ? 'Ask the user to get edit (or comment) access to the file.'
          : 'Ask the user to share the file with their own Google account.',
      }
    );
  }
  if (res.status === 404) {
    throw new GoogleToolError(
      'GOOGLE_NOT_FOUND',
      'The file was not found in Google Drive. Check the URL.'
    );
  }
  const message = String(body?.error?.message || '');
  throw new GoogleToolError(
    'GOOGLE_REQUEST_FAILED',
    `Google API request failed (${res.status})${message ? `: ${message}` : ''}`,
    {status: res.status}
  );
}

/**
 * Whether a 403 response body means the API is disabled for the OAuth
 * client's Google Cloud project, rather than a per-file permission error.
 */
function isApiDisabledError(body: any): boolean {
  const reasons = [
    body?.error?.errors?.[0]?.reason,
    ...(body?.error?.details || []).map((detail: any) => detail?.reason),
  ].map((reason) => String(reason || '').toLowerCase());
  return reasons.some(
    (reason) =>
      reason === 'accessnotconfigured' || reason === 'service_disabled'
  );
}

export interface DriveFileMetadata {
  id: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
}

export async function fetchFileMetadata(
  fileId: string
): Promise<DriveFileMetadata> {
  const res = await googleFetch(
    `${DRIVE_API_ORIGIN}/drive/v3/files/${encodeURIComponent(
      fileId
    )}?fields=${encodeURIComponent(FILE_FIELDS)}&supportsAllDrives=true`
  );
  return (await res.json()) as DriveFileMetadata;
}

export function shapeFileMeta(file: DriveFileMetadata): GoogleFileMeta {
  return {
    fileId: file.id,
    name: file.name || file.id,
    mimeType: file.mimeType || 'application/octet-stream',
    url:
      file.webViewLink ||
      `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`,
    ...(file.modifiedTime ? {modifiedTime: file.modifiedTime} : {}),
  };
}

/** Truncates `text` to `maxChars`, reporting whether anything was dropped. */
function truncate(
  text: string,
  maxChars: number
): {text: string; truncated: boolean} {
  if (text.length <= maxChars) {
    return {text, truncated: false};
  }
  return {text: text.slice(0, maxChars), truncated: true};
}

/**
 * Exports a native Google editors file (Doc, Slides, ...) as text. Google Docs
 * export cleanly to markdown, which preserves headings, lists and links for
 * the model; anything else falls back to plain text.
 */
async function exportAsText(fileId: string, mimeType: string): Promise<string> {
  const exportTypes =
    mimeType === DOC_MIME_TYPE
      ? ['text/markdown', 'text/plain']
      : ['text/plain'];
  let lastError: unknown = null;
  for (const exportMimeType of exportTypes) {
    try {
      const res = await googleFetch(
        `${DRIVE_API_ORIGIN}/drive/v3/files/${encodeURIComponent(
          fileId
        )}/export?mimeType=${encodeURIComponent(exportMimeType)}&supportsAllDrives=true`
      );
      return await res.text();
    } catch (err) {
      // An unsupported export format returns 400; fall through to the next.
      lastError = err;
    }
  }
  throw lastError;
}

/** Whether a Drive file's contents can be downloaded and read as text. */
function isTextMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    TEXT_MIME_TYPES.includes(mimeType.split(';')[0].trim())
  );
}

async function downloadAsText(file: DriveFileMetadata): Promise<string> {
  const sizeBytes = Number(file.size || 0);
  if (sizeBytes > MAX_DOWNLOAD_BYTES) {
    throw new GoogleToolError(
      'GOOGLE_UNSUPPORTED_FILE',
      `The file is too large to read (${sizeBytes} bytes).`
    );
  }
  const res = await googleFetch(
    `${DRIVE_API_ORIGIN}/drive/v3/files/${encodeURIComponent(
      file.id
    )}?alt=media&supportsAllDrives=true`
  );
  return await res.text();
}

/** Docs API `suggestionsViewMode` for each suggestions view. */
const SUGGESTIONS_VIEW_MODES: Record<GoogleDocSuggestionsView, string> = {
  accepted: 'PREVIEW_SUGGESTIONS_ACCEPTED',
  rejected: 'PREVIEW_WITHOUT_SUGGESTIONS',
  inline: 'SUGGESTIONS_INLINE',
};

/** Fails unless the file is a Google Doc (suggestions are Docs-only). */
function requireDocMeta(meta: GoogleFileMeta) {
  if (meta.mimeType !== DOC_MIME_TYPE) {
    throw new GoogleToolError(
      'GOOGLE_UNSUPPORTED_FILE',
      `"${meta.name}" is not a Google Doc (${meta.mimeType}), so it has no suggested edits.`
    );
  }
}

/**
 * Fetches a Google Doc's structure via the Docs API with the given
 * suggestions view. Viewing suggestions needs comment or edit access, which
 * the API reports as a 400.
 */
async function fetchDocument(
  fileId: string,
  view: GoogleDocSuggestionsView
): Promise<any> {
  const params = new URLSearchParams({
    includeTabsContent: 'true',
    suggestionsViewMode: SUGGESTIONS_VIEW_MODES[view],
  });
  try {
    const res = await googleFetch(
      `${DOCS_API_ORIGIN}/v1/documents/${encodeURIComponent(
        fileId
      )}?${params.toString()}`
    );
    return await res.json();
  } catch (err) {
    if (err instanceof GoogleToolError && err.status === 400) {
      throw new GoogleToolError(
        'GOOGLE_PERMISSION_DENIED',
        "The signed-in Google account can't see this doc's suggested edits.",
        {
          hint:
            'Suggestions are only visible with comment or edit access. Read ' +
            'the doc without `suggestions` instead, or ask the user for access.',
        }
      );
    }
    throw err;
  }
}

async function getDoc(
  fileRef: string,
  options: {maxChars: number; suggestions?: GoogleDocSuggestionsView}
): Promise<GoogleDocContent> {
  const {fileId} = requireFileRef(fileRef);
  const file = await fetchFileMetadata(fileId);
  const meta = shapeFileMeta(file);
  if (options.suggestions) {
    requireDocMeta(meta);
    const document = await fetchDocument(fileId, options.suggestions);
    const {text, truncated} = truncate(
      renderDocMarkdown(document, {inline: options.suggestions === 'inline'}),
      options.maxChars
    );
    return {...meta, text, truncated, suggestions: options.suggestions};
  }
  if (meta.mimeType === SHEET_MIME_TYPE) {
    throw new GoogleToolError(
      'GOOGLE_UNSUPPORTED_FILE',
      `"${meta.name}" is a Google Sheet, not a Google Doc.`,
      {hint: 'Call `gsheet_get` for this file instead.'}
    );
  }
  if (meta.mimeType === FOLDER_MIME_TYPE) {
    throw new GoogleToolError(
      'GOOGLE_UNSUPPORTED_FILE',
      `"${meta.name}" is a Drive folder, not a document.`
    );
  }
  const raw = meta.mimeType.startsWith('application/vnd.google-apps.')
    ? await exportAsText(fileId, meta.mimeType)
    : await readNonNativeFileAsText(file, meta);
  const {text, truncated} = truncate(raw, options.maxChars);
  return {...meta, text, truncated};
}

/** Reads an uploaded (non-native) Drive file as text, or fails clearly. */
async function readNonNativeFileAsText(
  file: DriveFileMetadata,
  meta: GoogleFileMeta
): Promise<string> {
  if (!isTextMimeType(meta.mimeType)) {
    throw new GoogleToolError(
      'GOOGLE_UNSUPPORTED_FILE',
      `"${meta.name}" is a ${meta.mimeType} file, which cannot be read as text.`
    );
  }
  return await downloadAsText(file);
}

/** Reads a file's metadata, failing unless it is a Google Sheet. */
export async function fetchSheetMeta(fileId: string): Promise<GoogleFileMeta> {
  const meta = shapeFileMeta(await fetchFileMetadata(fileId));
  if (meta.mimeType !== SHEET_MIME_TYPE) {
    throw new GoogleToolError(
      'GOOGLE_UNSUPPORTED_FILE',
      `"${meta.name}" is not a Google Sheet (${meta.mimeType}).`,
      {
        hint:
          meta.mimeType === DOC_MIME_TYPE
            ? 'Call `gdoc_get` for this file instead.'
            : meta.mimeType === SLIDES_MIME_TYPE
              ? 'Call `gslides_get` for this file instead.'
              : 'Call `gdrive_getFile` for this file instead.',
      }
    );
  }
  return meta;
}

/** Lists the tabs of a spreadsheet. */
export async function fetchSheetTabs(
  spreadsheetId: string,
  name: string
): Promise<GoogleSheetTab[]> {
  const propsRes = await googleFetch(
    `${SHEETS_API_ORIGIN}/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?fields=sheets.properties.sheetId,sheets.properties.title`
  );
  const propsBody = await propsRes.json();
  const tabs: GoogleSheetTab[] = (propsBody?.sheets || [])
    .map((sheet: any) => ({
      gid: sheet?.properties?.sheetId,
      title: String(sheet?.properties?.title || ''),
    }))
    .filter((tab: GoogleSheetTab) => typeof tab.gid === 'number');
  if (tabs.length === 0) {
    throw new GoogleToolError(
      'GOOGLE_REQUEST_FAILED',
      `"${name}" has no readable tabs.`
    );
  }
  return tabs;
}

async function getSheet(
  fileRef: string,
  options: {sheet?: string; maxRows: number}
): Promise<GoogleSheetContent> {
  const ref = requireFileRef(fileRef);
  const meta = await fetchSheetMeta(ref.fileId);
  const tabs = await fetchSheetTabs(ref.fileId, meta.name);
  const sheet = selectTab(tabs, options.sheet, ref.gid);

  // Request one extra row so truncation can be detected without a second call.
  const range = `${quoteSheetTitle(sheet.title)}!1:${options.maxRows + 1}`;
  const valuesRes = await googleFetch(
    `${SHEETS_API_ORIGIN}/v4/spreadsheets/${encodeURIComponent(
      ref.fileId
    )}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`
  );
  const valuesBody = await valuesRes.json();
  const allRows: string[][] = (valuesBody?.values || []).map((row: any[]) =>
    (row || []).map((cell: any) =>
      cell === null || cell === undefined ? '' : String(cell)
    )
  );
  const truncated = allRows.length > options.maxRows;
  const values = truncated ? allRows.slice(0, options.maxRows) : allRows;
  return {
    ...meta,
    tabs,
    sheet,
    values,
    rowCount: values.length,
    truncated,
  };
}

/**
 * Picks the tab to read: the explicitly requested one (by title or gid), else
 * the tab from the URL's `gid`, else the first tab.
 */
export function selectTab(
  tabs: GoogleSheetTab[],
  requested: string | undefined,
  urlGid: number | undefined
): GoogleSheetTab {
  const wanted = requested?.trim();
  if (wanted) {
    const byTitle = tabs.find(
      (tab) => tab.title.toLowerCase() === wanted.toLowerCase()
    );
    if (byTitle) {
      return byTitle;
    }
    if (/^\d+$/.test(wanted)) {
      const byGid = tabs.find((tab) => tab.gid === Number(wanted));
      if (byGid) {
        return byGid;
      }
    }
    throw new GoogleToolError(
      'GOOGLE_NOT_FOUND',
      `No tab named "${wanted}". Available tabs: ${tabs
        .map((tab) => tab.title)
        .join(', ')}.`
    );
  }
  if (typeof urlGid === 'number') {
    const byGid = tabs.find((tab) => tab.gid === urlGid);
    if (byGid) {
      return byGid;
    }
  }
  return tabs[0];
}

/** Quotes a sheet title for use in an A1 range (single quotes are doubled). */
export function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

/**
 * Converts a Slides API `TextContent` into text. Bulleted paragraphs become
 * markdown list items and linked runs become markdown links.
 */
function textContentToString(textContent: any): string {
  const parts: string[] = [];
  for (const element of textContent?.textElements || []) {
    const bullet = element?.paragraphMarker?.bullet;
    if (bullet) {
      parts.push(`${'  '.repeat(Number(bullet.nestingLevel || 0))}- `);
      continue;
    }
    const content = element?.textRun?.content;
    if (!content) {
      continue;
    }
    const url = element.textRun.style?.link?.url;
    const match = url ? content.match(/^(\s*)([\s\S]*?)(\s*)$/) : null;
    if (match && match[2]) {
      parts.push(`${match[1]}[${match[2]}](${url})${match[3]}`);
    } else {
      parts.push(content);
    }
  }
  return normalizeSlideText(parts.join(''));
}

/**
 * Normalizes slide text: soft line breaks (vertical tabs) become newlines,
 * trailing whitespace is dropped, and runs of blank lines are collapsed.
 */
function normalizeSlideText(text: string): string {
  return text
    .split('\u000b')
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Sorts page elements top-to-bottom, then left-to-right. */
function sortByPosition(elements: any[]): any[] {
  return [...elements].sort((a, b) => {
    const dy =
      Number(a?.transform?.translateY || 0) -
      Number(b?.transform?.translateY || 0);
    if (dy !== 0) {
      return dy;
    }
    return (
      Number(a?.transform?.translateX || 0) -
      Number(b?.transform?.translateX || 0)
    );
  });
}

/** Extracts the readable text of a single page element. */
function pageElementToString(element: any): string {
  if (element?.shape) {
    return textContentToString(element.shape.text);
  }
  if (element?.table) {
    return (element.table.tableRows || [])
      .map((row: any) =>
        (row?.tableCells || [])
          .map((cell: any) =>
            textContentToString(cell?.text).replace(/\s*\n\s*/g, ' ')
          )
          .join(' | ')
      )
      .filter((line: string) => line.replace(/[\s|]/g, ''))
      .join('\n');
  }
  if (element?.elementGroup) {
    return sortByPosition(element.elementGroup.children || [])
      .map(pageElementToString)
      .filter(Boolean)
      .join('\n\n');
  }
  if (element?.wordArt?.renderedText) {
    return normalizeSlideText(String(element.wordArt.renderedText));
  }
  if (element?.image || element?.video || element?.sheetsChart) {
    const alt = String(element.description || element.title || '').trim();
    if (alt) {
      const kind = element.image ? 'Image' : element.video ? 'Video' : 'Chart';
      return `[${kind}: ${alt}]`;
    }
  }
  return '';
}

/** Whether a page element is a slide's title placeholder. */
function isTitleElement(element: any): boolean {
  return TITLE_PLACEHOLDER_TYPES.includes(element?.shape?.placeholder?.type);
}

/** Extracts the speaker notes text from a slide, if any. */
function slideNotesToString(slide: any): string {
  const notesPage = slide?.slideProperties?.notesPage;
  const notesId = notesPage?.notesProperties?.speakerNotesObjectId;
  if (!notesId) {
    return '';
  }
  const notesShape = (notesPage.pageElements || []).find(
    (element: any) => element?.objectId === notesId
  );
  return notesShape ? pageElementToString(notesShape) : '';
}

/**
 * Converts a Slides API `Presentation` resource into `GoogleSlide`s. When
 * `linkedSlideId` is set, the matching slide is marked `linked: true`.
 */
export function extractSlides(
  presentation: any,
  linkedSlideId?: string
): GoogleSlide[] {
  return (presentation?.slides || []).map((slide: any, index: number) => {
    const elements = sortByPosition(slide?.pageElements || []);
    const titleElement = elements.find(isTitleElement);
    const title = titleElement ? pageElementToString(titleElement) : '';
    const text = elements
      .filter((element) => element !== titleElement)
      .map(pageElementToString)
      .filter(Boolean)
      .join('\n\n');
    const notes = slideNotesToString(slide);
    const objectId = String(slide?.objectId || '');
    const result: GoogleSlide = {slideNumber: index + 1, objectId, text};
    if (title) {
      result.title = title;
    }
    if (notes) {
      result.notes = notes;
    }
    if (slide?.slideProperties?.isSkipped) {
      result.skipped = true;
    }
    if (linkedSlideId && objectId === linkedSlideId) {
      result.linked = true;
    }
    return result;
  });
}

/**
 * Keeps slides until their combined title, text and notes reach `maxChars`.
 * The slide that crosses the limit is cut short and later slides are dropped.
 */
export function limitSlides(
  slides: GoogleSlide[],
  maxChars: number
): {slides: GoogleSlide[]; truncated: boolean} {
  const kept: GoogleSlide[] = [];
  let remaining = maxChars;
  for (const slide of slides) {
    if (remaining <= 0) {
      return {slides: kept, truncated: true};
    }
    const size =
      (slide.title?.length || 0) +
      slide.text.length +
      (slide.notes?.length || 0);
    if (size <= remaining) {
      kept.push(slide);
      remaining -= size;
      continue;
    }
    const cut: GoogleSlide = {...slide};
    if (cut.title) {
      cut.title = cut.title.slice(0, remaining);
      remaining -= cut.title.length;
    }
    cut.text = cut.text.slice(0, Math.max(remaining, 0));
    remaining -= cut.text.length;
    if (cut.notes) {
      if (remaining > 0) {
        cut.notes = cut.notes.slice(0, remaining);
      } else {
        delete cut.notes;
      }
    }
    kept.push(cut);
    return {slides: kept, truncated: true};
  }
  return {slides: kept, truncated: false};
}

async function getSlides(
  fileRef: string,
  options: {maxChars: number}
): Promise<GoogleSlidesContent> {
  const ref = requireFileRef(fileRef);
  const file = await fetchFileMetadata(ref.fileId);
  const meta = shapeFileMeta(file);
  if (meta.mimeType !== SLIDES_MIME_TYPE) {
    throw new GoogleToolError(
      'GOOGLE_UNSUPPORTED_FILE',
      `"${meta.name}" is not a Google Slides presentation (${meta.mimeType}).`,
      {
        hint:
          meta.mimeType === DOC_MIME_TYPE
            ? 'Call `gdoc_get` for this file instead.'
            : meta.mimeType === SHEET_MIME_TYPE
              ? 'Call `gsheet_get` for this file instead.'
              : 'Call `gdrive_getFile` for this file instead.',
      }
    );
  }

  let presentation: any;
  try {
    const res = await googleFetch(
      `${SLIDES_API_ORIGIN}/v1/presentations/${encodeURIComponent(
        ref.fileId
      )}?fields=${encodeURIComponent(SLIDES_FIELDS)}`
    );
    presentation = await res.json();
  } catch (err) {
    if (!(
      err instanceof GoogleToolError && err.code === 'GOOGLE_NOT_CONFIGURED'
    )) {
      throw err;
    }
    // The Slides API is not enabled for this project. Fall back to Drive's
    // plain-text export, which has the deck's text without slide structure.
    const {text, truncated} = truncate(
      await exportAsText(ref.fileId, meta.mimeType),
      options.maxChars
    );
    return {...meta, slides: [], text, truncated};
  }

  const allSlides = extractSlides(presentation, ref.slideId);
  const {slides, truncated} = limitSlides(allSlides, options.maxChars);
  return {...meta, slides, slideCount: allSlides.length, truncated};
}

async function getFile(
  fileRef: string,
  options: {maxChars: number}
): Promise<GoogleDriveFileContent> {
  const {fileId} = requireFileRef(fileRef);
  const file = await fetchFileMetadata(fileId);
  const meta = shapeFileMeta(file);
  const sizeBytes = Number(file.size || 0);
  const result: GoogleDriveFileContent = {
    ...meta,
    ...(sizeBytes ? {sizeBytes} : {}),
  };
  if (meta.mimeType === FOLDER_MIME_TYPE) {
    throw new GoogleToolError(
      'GOOGLE_UNSUPPORTED_FILE',
      `"${meta.name}" is a Drive folder. Ask the user for a link to a file.`
    );
  }
  if (meta.mimeType === SHEET_MIME_TYPE) {
    throw new GoogleToolError(
      'GOOGLE_UNSUPPORTED_FILE',
      `"${meta.name}" is a Google Sheet.`,
      {hint: 'Call `gsheet_get` for this file instead.'}
    );
  }
  if (meta.mimeType === DOC_MIME_TYPE || meta.mimeType === SLIDES_MIME_TYPE) {
    const raw = await exportAsText(fileId, meta.mimeType);
    const {text, truncated} = truncate(raw, options.maxChars);
    return {...result, text, truncated};
  }
  if (!isTextMimeType(meta.mimeType)) {
    // Binary files (images, PDFs, video) still return useful metadata.
    return result;
  }
  const {text, truncated} = truncate(
    await downloadAsText(file),
    options.maxChars
  );
  return {...result, text, truncated};
}

/** Drive API fields requested for each comment. */
const COMMENT_FIELDS =
  'id,content,author(displayName,emailAddress),createdTime,resolved,deleted,' +
  'quotedFileContent(value),' +
  'replies(id,content,author(displayName,emailAddress),createdTime,action,deleted)';

/** Formats a Drive `User` as "Name <email>" (or whichever part is known). */
function formatDriveUser(user: any): string | undefined {
  const name = String(user?.displayName || '').trim();
  const email = String(user?.emailAddress || '').trim();
  if (name && email) {
    return `${name} <${email}>`;
  }
  return name || email || undefined;
}

/** Converts a Drive API `Comment` resource into a `GoogleComment`. */
export function shapeComment(comment: any): GoogleComment {
  const quotedText = String(comment?.quotedFileContent?.value || '').trim();
  return {
    commentId: String(comment?.id || ''),
    author: formatDriveUser(comment?.author),
    content: String(comment?.content || ''),
    ...(quotedText ? {quotedText} : {}),
    createdTime: comment?.createdTime,
    resolved: Boolean(comment?.resolved),
    replies: (comment?.replies || [])
      .filter((reply: any) => !reply?.deleted)
      .map((reply: any) => ({
        replyId: String(reply?.id || ''),
        author: formatDriveUser(reply?.author),
        content: String(reply?.content || ''),
        createdTime: reply?.createdTime,
        ...(reply?.action ? {action: reply.action} : {}),
      })),
  };
}

async function listComments(
  fileRef: string,
  options: {includeResolved: boolean; maxResults: number}
): Promise<GoogleCommentsContent> {
  const {fileId} = requireFileRef(fileRef);
  const meta = shapeFileMeta(await fetchFileMetadata(fileId));
  return {...meta, ...(await fetchComments(fileId, options))};
}

/** Fetches up to `maxResults` comments on a Drive file. */
async function fetchComments(
  fileId: string,
  options: {includeResolved: boolean; maxResults: number}
): Promise<{comments: GoogleComment[]; truncated: boolean}> {
  const comments: GoogleComment[] = [];
  let pageToken = '';
  let truncated = false;
  // Pages through the comments until `maxResults` matches are collected.
  // Resolved comments are filtered client-side since the API can't.
  do {
    const params = new URLSearchParams({
      fields: `nextPageToken,comments(${COMMENT_FIELDS})`,
      pageSize: '100',
      includeDeleted: 'false',
    });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }
    const res = await googleFetch(
      `${DRIVE_API_ORIGIN}/drive/v3/files/${encodeURIComponent(
        fileId
      )}/comments?${params.toString()}`
    );
    const body = await res.json();
    for (const raw of body?.comments || []) {
      if (raw?.deleted || (raw?.resolved && !options.includeResolved)) {
        continue;
      }
      if (comments.length >= options.maxResults) {
        truncated = true;
        break;
      }
      comments.push(shapeComment(raw));
    }
    pageToken = truncated ? '' : String(body?.nextPageToken || '');
  } while (pageToken);
  return {comments, truncated};
}

async function getDocSuggestions(
  fileRef: string,
  options: {maxSuggestions: number; includeComments: boolean}
): Promise<GoogleDocSuggestionsContent> {
  const {fileId} = requireFileRef(fileRef);
  const meta = shapeFileMeta(await fetchFileMetadata(fileId));
  requireDocMeta(meta);
  const document = await fetchDocument(fileId, 'inline');
  const all = extractDocSuggestions(document);
  const result: GoogleDocSuggestionsContent = {
    ...meta,
    suggestions: all.slice(0, options.maxSuggestions),
    suggestionCount: all.length,
    truncated: all.length > options.maxSuggestions,
  };
  if (options.includeComments) {
    const {comments, truncated} = await fetchComments(fileId, {
      includeResolved: false,
      maxResults: DEFAULT_MAX_COMMENTS,
    });
    result.comments = comments;
    result.commentsTruncated = truncated;
  }
  return result;
}

/** Builds a `GoogleToolBackend` backed by the Drive and Sheets REST APIs. */
export function createClientGoogleToolBackend(): GoogleToolBackend {
  return {
    getDoc,
    getSheet,
    getSlides,
    getFile,
    listComments,
    getDocSuggestions,
  };
}

/** Matches a Google Docs/Sheets/Drive link inside chat text. */
const GOOGLE_LINK_RE = /https?:\/\/(?:docs|drive)\.google\.com\/[^\s<>)"']+/i;

/** Whether `text` references a Google Docs/Sheets/Drive file. */
export function containsGoogleLink(text: string): boolean {
  return GOOGLE_LINK_RE.test(text || '');
}

/**
 * Summarizes the Google tool calls in a conversation: whether any were made,
 * and whether a write failed because the user hadn't granted write access.
 */
export function getGoogleToolUsage(messages: UIMessage[]): {
  used: boolean;
  writeAuthFailed: boolean;
} {
  let used = false;
  let writeAuthFailed = false;
  for (const message of messages) {
    for (const part of (message.parts || []) as any[]) {
      const toolName =
        typeof part.type === 'string' && part.type.startsWith('tool-')
          ? part.type.slice('tool-'.length)
          : part.toolName;
      const isWrite = isGoogleWriteTool(toolName);
      if (
        !isWrite &&
        !(GOOGLE_TOOL_NAMES as readonly string[]).includes(toolName)
      ) {
        continue;
      }
      used = true;
      if (isWrite && part.output?.error === 'GOOGLE_AUTH_REQUIRED') {
        writeAuthFailed = true;
      }
    }
  }
  return {used, writeAuthFailed};
}

/**
 * Prompts the user to grant Google access when the conversation references a
 * Google link (or already called a Google tool, e.g. on a sheet linked to a
 * CMS doc) and no access token is held yet. When a Google edit failed for lack
 * of write access, write access is requested too.
 *
 * Tool calls run mid-stream, long after the user's last click, so a sign-in
 * popup opened from inside a tool would be blocked by the browser. Instead the
 * chat calls this from the send handler — still within the user's gesture — so
 * the token is ready by the time the model calls a Google tool. Failures
 * (cancelled popup, blocked popup) are non-fatal: the message is still sent
 * and the tool reports `GOOGLE_AUTH_REQUIRED` if it needs access.
 */
export async function maybeAuthorizeGoogle(
  texts: string[],
  messages: UIMessage[] = []
): Promise<void> {
  if (!isGoogleApiEnabled()) {
    return;
  }
  const usage = getGoogleToolUsage(messages);
  if (!usage.used && !texts.some(containsGoogleLink)) {
    return;
  }
  const extraScopes = usage.writeAuthFailed ? GOOGLE_WRITE_SCOPES : [];
  if (getGoogleAccessToken(extraScopes)) {
    return;
  }
  try {
    await ensureGoogleAccessToken({interactive: true, extraScopes});
  } catch (err) {
    console.warn('google sign-in skipped:', err);
  }
}

/**
 * Google tool set for the browser chat. Returns an empty set when the project
 * has no `gapi` config, so the model never sees tools it cannot use.
 *
 * Pass `{write: true}` to also include the (schema-only) write tools, which
 * the chat previews and applies via `googleToolHandlers.ts`.
 */
export function createClientGoogleTools(options?: {write?: boolean}): ToolSet {
  if (!isGoogleApiEnabled()) {
    return {};
  }
  return {
    ...createGoogleTools(createClientGoogleToolBackend()),
    ...(options?.write ? createGoogleWriteTools() : {}),
  };
}
