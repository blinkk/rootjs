import {Button} from '@mantine/core';
import {IconCloudOff, IconReload} from '@tabler/icons-preact';
import {errorMessage} from '../../utils/notifications.js';
import './DataLoadError.css';

export interface DataLoadErrorProps {
  /** Title shown above the error message. Defaults to a generic title. */
  title?: string;
  /** The error that caused the data to fail to load. */
  error?: unknown;
}

/**
 * Fallback screen rendered when the data backing a page or panel fails to
 * load, e.g. a Firestore request that errors or times out. Offers a reload
 * button since a fresh page load typically resolves transient issues.
 */
export function DataLoadError(props: DataLoadErrorProps) {
  const message = props.error ? errorMessage(props.error) : '';
  return (
    <div className="DataLoadError">
      <div className="DataLoadError__icon">
        <IconCloudOff size={60} />
      </div>
      <h2 className="DataLoadError__title">
        {props.title || 'Failed to load'}
      </h2>
      <p className="DataLoadError__body">
        Reload the page to try again. If the problem persists, check your
        network connection.
      </p>
      <Button
        color="dark"
        leftIcon={<IconReload size={16} />}
        onClick={() => window.location.reload()}
      >
        Reload page
      </Button>
      {message && <code className="DataLoadError__error">{message}</code>}
    </div>
  );
}
