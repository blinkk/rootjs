import {AppErrorBoundary} from './AppErrorBoundary/AppErrorBoundary.js';
import {AppProviders} from './AppProviders.js';
import {AppRoutes} from './AppRoutes.js';

/** The signed-in CMS app. */
export function App() {
  return (
    <AppProviders>
      <AppErrorBoundary>
        <AppRoutes />
      </AppErrorBoundary>
    </AppProviders>
  );
}
