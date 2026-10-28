import {Button} from '@mantine/core';
import {IconCloudOff, IconReload} from '@tabler/icons-preact';
import './RouteLoadError.css';

export interface RouteLoadErrorProps {
  /** The error that caused the route to fail to load. */
  error?: unknown;
}

/**
 * Fallback screen rendered when the js for a route fails to load, e.g. when
 * the server rebuilds or redeploys and the chunk files referenced by the
 * version of the app running in the browser no longer exist on the server.
 */
export function RouteLoadError(props: RouteLoadErrorProps) {
  const error = props.error;
  const errorMessage =
    error instanceof Error ? error.message : String(error || '');
  return (
    <div className="RouteLoadError">
      <div className="RouteLoadError__icon">
        <IconCloudOff size={60} />
      </div>
      <h2 className="RouteLoadError__title">Page failed to load</h2>
      <p className="RouteLoadError__body">
        The CMS may have been updated since this page was first opened. Reload
        the page to fetch the latest version. If the problem persists, check
        your network connection and try again.
      </p>
      <Button
        color="dark"
        leftIcon={<IconReload size={16} />}
        onClick={() => window.location.reload()}
      >
        Reload page
      </Button>
      {errorMessage && (
        <code className="RouteLoadError__error">{errorMessage}</code>
      )}
    </div>
  );
}
