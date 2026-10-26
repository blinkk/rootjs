import {Button} from '@mantine/core';
import {IconCheck, IconCopy} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';
import {
  ErrorReport,
  formatErrorReport,
  onErrorReportUpdate,
} from '../../utils/error-reports.js';
import './ErrorDetails.css';

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
    <div className={joinClassNames('ErrorDetails', props.className)}>
      <p className="ErrorDetails__help">
        If this keeps happening, copy the error details and send them to your
        site's developer.
      </p>
      <div className="ErrorDetails__actions">
        <div className="ErrorDetails__id">
          Error ID: <code>{report.id}</code>
        </div>
        <Button
          variant="default"
          size="xs"
          leftIcon={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          onClick={copyDetails}
        >
          {copied ? 'Copied' : 'Copy error details'}
        </Button>
      </div>
      <details className="ErrorDetails__details">
        <summary>Technical details</summary>
        <pre className="ErrorDetails__stack">{formatErrorReport(report)}</pre>
        <a
          className="ErrorDetails__link"
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
