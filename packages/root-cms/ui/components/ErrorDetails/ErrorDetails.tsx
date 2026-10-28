import {IconCheck, IconCopy} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {
  ErrorReport,
  formatErrorReport,
  onErrorReportUpdate,
} from '../../features/logs/error-reports.js';
import {Button} from '../../primitives/Button/Button.js';
import {cn} from '../../utils/classes.js';

export interface ErrorDetailsProps {
  className?: string;
  report: ErrorReport;
}

/**
 * Shows the id of an error report along with a button that copies the full
 * report, so the user can share it with a developer. The stack trace is
 * collapsed by default since it's only useful to developers.
 */
export function ErrorDetails(props: ErrorDetailsProps) {
  const report = useErrorReport(props.report);
  const [copied, setCopied] = useState(false);

  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(formatErrorReport(report));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('failed to copy error details:', err);
    }
  }

  return (
    <div
      className={cn(
        'ErrorDetails mt-4 flex w-full max-w-160 flex-col items-center gap-3',
        props.className
      )}
    >
      <p className="ErrorDetails__help m-0 text-base text-muted">
        If this keeps happening, copy the error details and send them to your
        site's developer.
      </p>
      <div className="ErrorDetails__actions flex flex-wrap items-center justify-center gap-3">
        <div className="ErrorDetails__id text-base">
          Error ID: <code className="select-all font-mono">{report.id}</code>
        </div>
        <Button
          size="sm"
          icon={copied ? <IconCheck /> : <IconCopy />}
          onClick={copyDetails}
        >
          {copied ? 'Copied' : 'Copy error details'}
        </Button>
      </div>
      <details className="ErrorDetails__details w-full text-left text-sm">
        <summary className="cursor-pointer text-center text-muted">
          Technical details
        </summary>
        <pre className="ErrorDetails__stack mx-0 my-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-sm border border-solid border-border p-3 font-mono text-xs leading-normal">
          {formatErrorReport(report)}
        </pre>
        <a
          className="ErrorDetails__link text-inherit"
          href={`/cms/logs/errors?id=${encodeURIComponent(report.id)}`}
        >
          View in error logs
        </a>
      </details>
    </div>
  );
}

/**
 * Returns the latest version of a report, which is updated with the
 * source-mapped stack trace once the server has logged it.
 */
function useErrorReport(initial: ErrorReport): ErrorReport {
  const [report, setReport] = useState(initial);
  useEffect(() => {
    setReport(initial);
    return onErrorReportUpdate(initial.id, setReport);
  }, [initial]);
  return report;
}
