import {Button, Loader, TextInput} from '@mantine/core';
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
      <div className="ErrorLogsPage">
        <div className="ErrorLogsPage__header">
          <div className="ErrorLogsPage__header__title">
            <Heading size="h1">Error Logs</Heading>
            <Button component="a" href="/cms/logs" variant="default" size="xs">
              View action logs
            </Button>
          </div>
          <p>
            Errors that users ran into in the CMS UI. Stack traces are mapped to
            the original source files. Errors can also be viewed from the
            command line with <code>root-cms errors.get &lt;id&gt;</code>.
          </p>
        </div>
        <TextInput
          className="ErrorLogsPage__search"
          placeholder="Search by error ID, message or user..."
          icon={<IconSearch size={16} />}
          value={search}
          onChange={(e: Event) =>
            setSearch((e.target as HTMLInputElement).value)
          }
        />
        {loading ? (
          <div className="ErrorLogsPage__loading">
            <Loader color="gray" size="xl" />
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
              <div className="ErrorLogsPage__empty">
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
    <details className="ErrorLogsPage__item" open={props.open}>
      <summary className="ErrorLogsPage__item__summary">
        <span className="ErrorLogsPage__item__time">
          {new Date(report.timestamp).toLocaleString('en', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </span>
        <span className="ErrorLogsPage__item__message">
          {report.name ? `${report.name}: ` : ''}
          {report.message}
        </span>
        <span className="ErrorLogsPage__item__user">{report.by || '—'}</span>
        <code className="ErrorLogsPage__item__id">{report.id}</code>
      </summary>
      <div className="ErrorLogsPage__item__body">
        <pre className="ErrorLogsPage__item__stack">
          {formatErrorReport(report)}
        </pre>
        <Button
          variant="default"
          size="xs"
          leftIcon={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
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
