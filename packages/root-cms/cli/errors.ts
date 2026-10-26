import {loadRootConfig} from '@blinkk/root/node';
import {dim, red} from 'kleur/colors';
import {RootCMSClient} from '../core/client.js';
import {formatErrorReport} from '../shared/error-reports.js';

export interface ErrorsListOptions {
  /** Max number of errors to list. */
  limit?: string;
  /** Output machine-readable JSON. */
  json?: boolean;
}

export interface ErrorsGetOptions {
  /** Output machine-readable JSON. */
  json?: boolean;
}

/**
 * Lists the most recent errors reported by the CMS UI.
 *
 * Usage:
 *   root-cms errors.list [--limit 20] [--json]
 */
export async function errorsList(options: ErrorsListOptions) {
  const limit = options.limit ? parseInt(options.limit, 10) : 20;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`invalid --limit: ${options.limit}`);
  }
  const client = await createClient();
  const reports = await client.listErrorLogs({limit});
  if (options.json) {
    console.log(JSON.stringify(reports, null, 2));
    return;
  }
  if (reports.length === 0) {
    console.log('no errors reported');
    return;
  }
  for (const report of reports) {
    const time = new Date(report.timestamp).toISOString();
    console.log(
      `${report.id}  ${dim(time)}  ${report.by || 'unknown'}  ${red(
        firstLine(report.message)
      )}`
    );
  }
  console.log(dim('\nrun `root-cms errors.get <id>` to see the stack trace'));
}

/**
 * Prints the full report for an error reported by the CMS UI, including the
 * stack trace. The id is shown to the user on the error screen.
 *
 * Usage:
 *   root-cms errors.get <id> [--json]
 */
export async function errorsGet(id: string, options: ErrorsGetOptions) {
  const client = await createClient();
  const report = await client.getErrorLog(id.trim());
  if (!report) {
    throw new Error(`error not found: ${id}`);
  }
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(formatErrorReport(report));
}

async function createClient() {
  const rootDir = process.cwd();
  const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
  return new RootCMSClient(rootConfig);
}

function firstLine(str: string) {
  return str.split('\n')[0];
}
