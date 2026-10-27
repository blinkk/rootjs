import fs from 'node:fs';
import {SourceMap} from 'node:module';
import path from 'node:path';
import {
  ERROR_REPORT_MAX_LENGTHS,
  ERROR_REPORT_SOURCES,
  ErrorReport,
  ErrorReportSource,
} from '../shared/error-reports.js';

/**
 * Matches a stack frame location in the CMS UI bundle, e.g.
 * `https://example.com/cms/static/chunk-ABC123.js?c=123:1:4567`. The file name
 * is restricted to a flat file in the static dir so it can't be used to read
 * arbitrary files from the server.
 */
const STATIC_FRAME_RE =
  /(?:https?:\/\/[^\s/()]+)?\/cms\/static\/([\w.-]+\.js)(?:\?[^\s:()]*)?:(\d+):(\d+)/g;

/** Parsed source maps, keyed by file path. `null` if the map doesn't exist. */
const SOURCE_MAP_CACHE = new Map<string, SourceMap | null>();

/**
 * Validates an error report sent by the browser, trimming oversized fields.
 * Returns `null` if the report is missing required fields.
 */
export function normalizeErrorReport(data: any): ErrorReport | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const id = str(data.id, ERROR_REPORT_MAX_LENGTHS.id);
  if (!id || !/^[\w-]+$/.test(id)) {
    return null;
  }
  const message = str(data.message, ERROR_REPORT_MAX_LENGTHS.message);
  if (!message) {
    return null;
  }
  const source: ErrorReportSource = ERROR_REPORT_SOURCES.includes(data.source)
    ? data.source
    : 'uncaught';
  const report: ErrorReport = {
    id: id,
    source: source,
    message: message,
    url: str(data.url, ERROR_REPORT_MAX_LENGTHS.url),
    timestamp:
      typeof data.timestamp === 'number' && Number.isFinite(data.timestamp)
        ? data.timestamp
        : Date.now(),
  };
  const name = str(data.name, ERROR_REPORT_MAX_LENGTHS.name);
  if (name) {
    report.name = name;
  }
  const stack = str(data.stack, ERROR_REPORT_MAX_LENGTHS.stack);
  if (stack) {
    report.stack = stack;
  }
  const componentStack = str(
    data.componentStack,
    ERROR_REPORT_MAX_LENGTHS.componentStack
  );
  if (componentStack) {
    report.componentStack = componentStack;
  }
  const userAgent = str(data.userAgent, ERROR_REPORT_MAX_LENGTHS.userAgent);
  if (userAgent) {
    report.userAgent = userAgent;
  }
  return report;
}

function str(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/**
 * Rewrites the stack frames in `stack` that point at the minified CMS UI
 * bundle (`/cms/static/*.js`) to the original source file and line, using the
 * `.js.map` files next to the bundle in `staticDir`. Frames that can't be
 * resolved are left as-is.
 *
 * Usage:
 * ```
 * resolveStack('at a (https://example.com/cms/static/ui.js:1:4567)', dir);
 * // => 'at a (ui/components/DocEditor/DocEditor.tsx:120:9)'
 * ```
 */
export function resolveStack(stack: string, staticDir: string): string {
  return stack.replace(
    STATIC_FRAME_RE,
    (match: string, file: string, line: string, column: string) => {
      const sourceMap = loadSourceMap(path.join(staticDir, `${file}.map`));
      if (!sourceMap) {
        return match;
      }
      const origin = sourceMap.findOrigin(Number(line), Number(column)) as {
        fileName?: string;
        lineNumber?: number;
        columnNumber?: number;
      };
      if (!origin.fileName || !origin.lineNumber || !origin.columnNumber) {
        return match;
      }
      const fileName = cleanSourcePath(origin.fileName);
      return `${fileName}:${origin.lineNumber}:${origin.columnNumber}`;
    }
  );
}

function loadSourceMap(filePath: string): SourceMap | null {
  if (SOURCE_MAP_CACHE.has(filePath)) {
    return SOURCE_MAP_CACHE.get(filePath)!;
  }
  let sourceMap: SourceMap | null = null;
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    sourceMap = new SourceMap(payload);
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      console.error(`failed to load source map ${filePath}:`, err);
    }
  }
  SOURCE_MAP_CACHE.set(filePath, sourceMap);
  return sourceMap;
}

/**
 * Shortens a source path from a source map, which is relative to the bundle's
 * output dir, e.g. `../../ui/ui.tsx` becomes `ui/ui.tsx` and
 * `../../../../node_modules/.pnpm/preact@10/node_modules/preact/src/diff.js`
 * becomes `node_modules/preact/src/diff.js`.
 */
function cleanSourcePath(fileName: string): string {
  return fileName
    .replace(/^(\.\.\/)+/, '')
    .replace(/^.*node_modules\/\.pnpm\/[^/]+\/node_modules\//, 'node_modules/');
}

/**
 * Converts an `ErrorLogs` doc from the database to an `ErrorReport`, whose
 * `timestamp` is epoch millis rather than a Firestore `Timestamp`.
 */
export function toErrorReport(data: any): ErrorReport {
  const timestamp = data?.timestamp;
  return {
    ...data,
    timestamp:
      typeof timestamp?.toMillis === 'function'
        ? timestamp.toMillis()
        : timestamp,
  };
}
