/**
 * Shared types and helpers for CMS UI error reports, which are sent from the
 * browser when the UI crashes and stored in `Projects/{projectId}/ErrorLogs`.
 */

/** Where in the UI an error was caught. */
export type ErrorReportSource =
  /** A route threw while rendering and the whole page was replaced. */
  | 'render'
  /** A single doc editor field threw while rendering. */
  | 'field'
  /** An error thrown outside of a render pass, e.g. in an event handler. */
  | 'uncaught'
  /** A promise rejected without a `.catch()` handler. */
  | 'unhandledrejection';

export const ERROR_REPORT_SOURCES: ErrorReportSource[] = [
  'render',
  'field',
  'uncaught',
  'unhandledrejection',
];

/** An error captured by the CMS UI. */
export interface ErrorReport {
  /**
   * Short id shown to the user, so they can pass it along to a developer who
   * can then look up the full report.
   */
  id: string;
  source: ErrorReportSource;
  /** The error's name, e.g. `TypeError`. */
  name?: string;
  message: string;
  /**
   * The stack trace. Once logged, frames that point at the minified CMS
   * bundle are resolved to their original source file and line.
   */
  stack?: string;
  /** The stack as reported by the browser, before resolving source maps. */
  rawStack?: string;
  /** The component stack, for errors caught by an error boundary. */
  componentStack?: string;
  /** The page URL when the error occurred. */
  url: string;
  userAgent?: string;
  /** Epoch millis for when the error occurred. */
  timestamp: number;
  /** Email of the user who hit the error. Set by the server. */
  by?: string;
  /** Version of the `@blinkk/root-cms` package running on the server. */
  cmsVersion?: string;
}

/** Max lengths for the string fields in a report, enforced by the server. */
export const ERROR_REPORT_MAX_LENGTHS = {
  id: 64,
  name: 200,
  message: 4000,
  stack: 20000,
  componentStack: 10000,
  url: 2000,
  userAgent: 500,
};

/**
 * Formats a report as plain text, for copying into a bug report or printing
 * from the CLI.
 */
export function formatErrorReport(report: ErrorReport): string {
  const lines = [`Error ID: ${report.id}`];
  lines.push(`Time: ${new Date(report.timestamp).toISOString()}`);
  if (report.by) {
    lines.push(`User: ${report.by}`);
  }
  lines.push(`URL: ${report.url}`);
  lines.push(`Source: ${report.source}`);
  if (report.cmsVersion) {
    lines.push(`CMS version: ${report.cmsVersion}`);
  }
  if (report.userAgent) {
    lines.push(`User agent: ${report.userAgent}`);
  }
  lines.push('');
  const name = report.name || 'Error';
  // Stacks from V8 start with "<name>: <message>"; others are frames only.
  const stack = report.stack || '';
  if (stack.startsWith(`${name}: `)) {
    lines.push(stack);
  } else {
    lines.push(`${name}: ${report.message}`);
    if (stack) {
      lines.push(stack);
    }
  }
  if (report.componentStack) {
    lines.push('', 'Component stack:', report.componentStack.trim());
  }
  return lines.join('\n');
}
