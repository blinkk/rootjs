import {
  ErrorReport,
  ErrorReportSource,
  formatErrorReport,
} from '../../../shared/error-reports.js';
import {errorMessage} from '../../utils/notifications.js';

export type {ErrorReport} from '../../../shared/error-reports.js';
export {formatErrorReport};

/**
 * Max number of reports sent to the server per page load, so an error that
 * repeats in a loop can't flood the error log.
 */
const MAX_REPORTS_PER_PAGE = 20;

/** Reports created on this page, keyed by source + message + stack. */
const REPORTS = new Map<string, ErrorReport>();

/** Listeners notified when a report is updated after being logged. */
const LISTENERS = new Map<string, Set<(report: ErrorReport) => void>>();

export interface ReportErrorOptions {
  source: ErrorReportSource;
  /** The component stack, for errors caught by an error boundary. */
  componentStack?: string;
}

/**
 * Creates a report for an error and saves it to the project's error log, so
 * that a developer can look up the full stack trace using the report's id.
 * The report is returned right away and logged in the background. Repeats of
 * the same error return the original report.
 *
 * Usage:
 * ```
 * const report = reportError(err, {source: 'render'});
 * showMessage(`Error ID: ${report.id}`);
 * ```
 */
export function reportError(
  err: unknown,
  options: ReportErrorOptions
): ErrorReport {
  const obj = (typeof err === 'object' && err !== null ? err : {}) as Record<
    string,
    unknown
  >;
  const message = errorMessage(err) || 'Unknown error';
  const stack = typeof obj.stack === 'string' ? obj.stack : undefined;
  const key = `${options.source}:${message}:${stack || ''}`;
  const existing = REPORTS.get(key);
  if (existing) {
    return existing;
  }

  const report: ErrorReport = {
    id: createErrorId(),
    source: options.source,
    message: message,
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: Date.now(),
  };
  if (typeof obj.name === 'string') {
    report.name = obj.name;
  }
  if (stack) {
    report.stack = stack;
  }
  if (options.componentStack) {
    report.componentStack = options.componentStack;
  }
  REPORTS.set(key, report);
  if (REPORTS.size <= MAX_REPORTS_PER_PAGE) {
    logErrorReport(report);
  }
  return report;
}

/**
 * Subscribes to updates to a report, which is updated with the source-mapped
 * stack trace once the server has logged it. Returns an unsubscribe function.
 */
export function onErrorReportUpdate(
  id: string,
  callback: (report: ErrorReport) => void
): () => void {
  let listeners = LISTENERS.get(id);
  if (!listeners) {
    listeners = new Set();
    LISTENERS.set(id, listeners);
  }
  listeners.add(callback);
  return () => listeners!.delete(callback);
}

async function logErrorReport(report: ErrorReport) {
  // Logging errors must never throw, since the caller is an error handler.
  try {
    const res = await fetch('/cms/api/errors.log', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(report),
    });
    if (res.status !== 200) {
      console.error(`failed to log error ${report.id}:`, await res.text());
      return;
    }
    const resData = await res.json();
    const stack = resData?.data?.stack;
    if (stack && stack !== report.stack) {
      report.rawStack = report.stack;
      report.stack = stack;
      LISTENERS.get(report.id)?.forEach((callback) => callback({...report}));
    }
  } catch (err) {
    console.error(`failed to log error ${report.id}:`, err);
  }
}

/**
 * Returns a short, random id that's easy to read out or paste, e.g.
 * `k3x9q2m7pa`. Ambiguous characters (0/o, 1/l) are left out.
 */
function createErrorId(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join('');
}
