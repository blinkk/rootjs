import {IconCloudOff, IconReload} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {ErrorReport} from '../../features/logs/error-reports.js';
import {Button} from '../../primitives/Button/Button.js';
import {cn} from '../../utils/classes.js';
import {errorMessage} from '../../utils/notifications.js';
import {ErrorDetails} from '../ErrorDetails/ErrorDetails.js';

export interface DataLoadErrorProps {
  /** Title shown above the error message. Defaults to a generic title. */
  title?: string;
  /** Text shown below the title. Defaults to a hint to reload the page. */
  body?: ComponentChildren;
  /** The error that caused the data to fail to load. */
  error?: unknown;
  /**
   * A report for the error. When set, the error id and a button to copy the
   * full report are shown in place of the error message.
   */
  report?: ErrorReport;
  className?: string;
}

/**
 * Fallback screen rendered when the data backing a page or panel fails to
 * load, e.g. a Firestore request that errors or times out. Offers a reload
 * button since a fresh page load typically resolves transient issues.
 */
export function DataLoadError(props: DataLoadErrorProps) {
  const message = props.error ? errorMessage(props.error) : '';
  return (
    <ErrorScreen
      className={cn('DataLoadError min-h-80', props.className)}
      block="DataLoadError"
      title={props.title || 'Failed to load'}
      body={
        props.body ||
        'Reload the page to try again. If the problem persists, check your network connection.'
      }
      message={message}
    >
      {props.report && <ErrorDetails report={props.report} />}
    </ErrorScreen>
  );
}

export interface ErrorScreenProps {
  /** The BEM block name for the parts, e.g. `DataLoadError`. */
  block: string;
  title: ComponentChildren;
  body: ComponentChildren;
  /** A technical error message, shown in code type below the button. */
  message?: string;
  className?: string;
  children?: ComponentChildren;
}

/**
 * The centered icon, title, body and reload button shared by the error
 * screens (`DataLoadError`, `RouteLoadError`).
 */
export function ErrorScreen(props: ErrorScreenProps) {
  const b = props.block;
  return (
    <div
      className={cn(
        'flex w-full flex-col items-center justify-center gap-3 px-5 py-10 text-center',
        props.className
      )}
    >
      <div className={cn(`${b}__icon`, 'text-fg')}>
        <IconCloudOff size={60} />
      </div>
      <h2
        className={cn(
          `${b}__title`,
          'm-0 text-2xl font-bold leading-tight text-fg'
        )}
      >
        {props.title}
      </h2>
      <p className={cn(`${b}__body`, 'm-0 max-w-120 text-lg text-fg')}>
        {props.body}
      </p>
      <Button
        variant="primary"
        size="md"
        icon={<IconReload />}
        onClick={() => window.location.reload()}
      >
        Reload page
      </Button>
      {props.message && (
        <code
          className={cn(
            `${b}__error`,
            'mt-4 max-w-160 break-words font-mono text-sm text-danger'
          )}
        >
          {props.message}
        </code>
      )}
      {props.children}
    </div>
  );
}
