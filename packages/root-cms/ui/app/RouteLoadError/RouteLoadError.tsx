import {ErrorScreen} from '../../components/DataLoadError/DataLoadError.js';

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
    <ErrorScreen
      className="RouteLoadError min-h-screen"
      block="RouteLoadError"
      title="Page failed to load"
      body="The CMS may have been updated since this page was first opened. Reload the page to fetch the latest version. If the problem persists, check your network connection and try again."
      message={errorMessage}
    />
  );
}
