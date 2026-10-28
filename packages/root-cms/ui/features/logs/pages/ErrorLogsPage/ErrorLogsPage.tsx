import {IconCheck, IconCopy, IconSearch} from '@tabler/icons-preact';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {Layout} from '../../../../app/layout/Layout.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {Surface} from '../../../../components/Surface/Surface.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {useStringParam} from '../../../../hooks/useQueryParam.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {withTimeout} from '../../../../utils/with-timeout.js';
import {ErrorReport, formatErrorReport} from '../../error-reports.js';
import './ErrorLogsPage.css';

/** Number of recent errors to load. */
const NUM_ERRORS = 100;

/**
 * Lists the most recent errors reported by the CMS UI, for developers to look
 * up the stack trace of an error id that a user sent them. Use `?id=<id>` to
 * link to a specific error.
 */
export function ErrorLogsPage() {
  usePageTitle('Error Logs');
  const [errorId] = useStringParam('id');
  const [search, setSearch] = useState(errorId);
  const {loading, reports} = useErrorLogs(errorId);

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return reports;
    }
    return reports.filter((report) =>
      [report.id, report.message, report.by, report.url].some((value) =>
        value?.toLowerCase().includes(q)
      )
    );
  }, [reports, search]);

  return (
    <Layout>
      <div className="ErrorLogsPage flex flex-col gap-4 bg-page p-page">
        <div className="ErrorLogsPage__header mb-3.5">
          <div className="ErrorLogsPage__header__title flex flex-wrap items-center justify-between gap-4">
            <Heading size="h1">Error Logs</Heading>
            <Button href="/cms/logs" variant="default" size="sm">
              View action logs
            </Button>
          </div>
          <p className="mt-4 mb-0 max-w-150 text-base">
            Errors that users ran into in the CMS UI. Stack traces are mapped to
            the original source files. Errors can also be viewed from the
            command line with{' '}
            <code className="whitespace-nowrap rounded-sm border border-solid border-border bg-chip px-1.5 py-0.5 font-mono text-sm">
              root-cms errors.get &lt;id&gt;
            </code>
            .
          </p>
        </div>
        <TextInput
          className="ErrorLogsPage__search w-full max-w-100"
          size="md"
          aria-label="Search errors"
          placeholder="Search by error ID, message or user..."
          leftSection={<IconSearch />}
          value={search}
          onInput={(e) => setSearch(e.currentTarget.value)}
        />
        {loading ? (
          <div className="ErrorLogsPage__loading flex min-h-50 items-center justify-center text-muted">
            <Spinner size="lg" />
          </div>
        ) : (
          <Surface className="ErrorLogsPage__list">
            {filteredReports.map((report) => (
              <ErrorLogItem
                key={report.id}
                report={report}
                open={report.id === errorId}
              />
            ))}
            {filteredReports.length === 0 && (
              <div className="ErrorLogsPage__empty px-5 py-10 text-center text-base text-muted">
                {reports.length === 0
                  ? 'No errors have been reported.'
                  : 'No errors found matching your search.'}
              </div>
            )}
          </Surface>
        )}
      </div>
    </Layout>
  );
}

function ErrorLogItem(props: {report: ErrorReport; open?: boolean}) {
  const report = props.report;
  const [copied, setCopied] = useState(false);

  async function copyDetails() {
    await navigator.clipboard.writeText(formatErrorReport(report));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <details
      className="ErrorLogsPage__item border-0 border-solid border-border not-first:border-t"
      open={props.open}
    >
      <summary className="ErrorLogsPage__item__summary flex cursor-pointer list-none flex-col items-start gap-1 px-4 py-2.5 text-sm hover:bg-surface-hover md:flex-row md:items-center md:gap-4">
        <span className="ErrorLogsPage__item__time shrink-0 whitespace-nowrap text-muted md:w-40">
          {new Date(report.timestamp).toLocaleString('en', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </span>
        <span className="ErrorLogsPage__item__message w-full min-w-0 truncate md:w-auto md:flex-1">
          {report.name ? `${report.name}: ` : ''}
          {report.message}
        </span>
        <span className="ErrorLogsPage__item__user max-w-full truncate text-muted md:shrink-0">
          {report.by || '—'}
        </span>
        <code className="ErrorLogsPage__item__id break-all font-mono text-sm md:shrink-0">
          {report.id}
        </code>
      </summary>
      <div className="ErrorLogsPage__item__body px-4 pb-4">
        <pre className="ErrorLogsPage__item__stack mt-0 mb-3 max-h-120 overflow-auto whitespace-pre-wrap break-words rounded-sm border border-solid border-border p-3 font-mono text-xs leading-normal">
          {formatErrorReport(report)}
        </pre>
        <Button
          variant="default"
          size="sm"
          icon={copied ? <IconCheck /> : <IconCopy />}
          onClick={() => notifyErrors(copyDetails)}
        >
          {copied ? 'Copied' : 'Copy error details'}
        </Button>
      </div>
    </details>
  );
}

/**
 * Loads the most recent error reports. If `errorId` is set and isn't one of
 * the most recent, it's loaded separately and added to the top of the list.
 */
function useErrorLogs(errorId: string) {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<ErrorReport[]>([]);

  useEffect(() => {
    const init = async () => {
      await notifyErrors(async () => {
        const reports = await withTimeout(
          listErrorLogs(),
          undefined,
          'loading error logs'
        );
        if (errorId && !reports.some((report) => report.id === errorId)) {
          const report = await getErrorLog(errorId);
          if (report) {
            reports.unshift(report);
          }
        }
        setReports(reports);
      });
      setLoading(false);
    };
    init();
  }, [errorId]);

  return {loading, reports};
}

function errorLogsCollection() {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  return collection(window.firebase.db, 'Projects', projectId, 'ErrorLogs');
}

async function listErrorLogs(): Promise<ErrorReport[]> {
  const q = query(
    errorLogsCollection(),
    orderBy('timestamp', 'desc'),
    limit(NUM_ERRORS)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => toErrorReport(doc.data()));
}

async function getErrorLog(id: string): Promise<ErrorReport | null> {
  const snapshot = await getDoc(doc(errorLogsCollection(), id));
  return snapshot.exists() ? toErrorReport(snapshot.data()) : null;
}

function toErrorReport(data: any): ErrorReport {
  return {...data, timestamp: data.timestamp?.toMillis?.() ?? data.timestamp};
}
