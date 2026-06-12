import {Loader} from '@mantine/core';
import {Layout} from '../../layout/Layout.js';
import {joinClassNames} from '../../utils/classes.js';
import './RouteLoading.css';

export interface RouteLoadingProps {
  /**
   * Whether to render within the app frame (topbar, sidebar). Disable for
   * routes that render outside the frame, e.g. the embedded pages.
   */
  frame?: boolean;
}

/**
 * Loading screen rendered while the js for a route is being fetched. The
 * spinner fades in after a short delay so it doesn't flash when the import
 * resolves quickly.
 */
export function RouteLoading(props: RouteLoadingProps) {
  const frame = props.frame ?? true;
  const loader = (
    <div
      className={joinClassNames(
        'RouteLoading',
        frame && 'RouteLoading--framed'
      )}
    >
      <Loader color="gray" size="xl" />
    </div>
  );
  if (!frame) {
    return loader;
  }
  return <Layout>{loader}</Layout>;
}
