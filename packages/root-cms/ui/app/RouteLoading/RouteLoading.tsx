import './RouteLoading.css';

import {Spinner} from '../../primitives/Spinner/Spinner.js';
import {cn} from '../../utils/classes.js';
import {Layout} from '../layout/Layout.js';

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
  // Within the frame, `.Layout__main > *:first-child` sizes it to the
  // content area.
  const loader = (
    <div
      className={cn(
        'RouteLoading flex items-center justify-center text-muted',
        frame ? 'RouteLoading--framed bg-page' : 'h-screen w-full'
      )}
    >
      <Spinner size="lg" className="size-12" />
    </div>
  );
  if (!frame) {
    return loader;
  }
  return <Layout>{loader}</Layout>;
}
