import {Loader} from '@mantine/core';
import './RouteLoading.css';

/**
 * Loading screen rendered while the js for a route is being fetched. Fades in
 * after a short delay so it doesn't flash when the import resolves quickly.
 */
export function RouteLoading() {
  return (
    <div className="RouteLoading">
      <Loader color="gray" size="xl" />
    </div>
  );
}
