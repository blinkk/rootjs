import type {ComponentChildren} from 'preact';
import {useEffect} from 'preact/hooks';
import {LocationProvider} from 'preact-iso';
import {
  PinnedCommentThreadsProvider,
  usePinnedCommentThreads,
} from '../features/comments/usePinnedCommentThreads.js';
import {PendingReleasesProvider} from '../features/releases/usePendingReleases.js';
import {GlobalSearch} from '../features/search/GlobalSearch/GlobalSearch.js';
import {FirebaseContext} from '../hooks/useFirebase.js';
import {SiteSettingsProvider} from '../hooks/useSiteSettings.js';
import {SSEProvider} from '../hooks/useSSE.js';
import {ThemeLoader} from '../hooks/useTheme.js';
import {UserPreferencesProvider} from '../hooks/useUserPreferences.js';
import {ModalsProvider} from '../primitives/modals/ModalsProvider.js';
import {Toaster} from '../primitives/Toast/Toast.js';
import {APP_MODALS, preloadCommonModals} from './app-modals.js';
import {lazyComponent} from './lazy-component.js';

const PinnedCommentThreads = lazyComponent(
  () =>
    import('../features/comments/PinnedCommentThreads/PinnedCommentThreads.js').then(
      (m) => m.PinnedCommentThreads
    ),
  {fallback: null}
);

/** Renders the pinned comments, which load only once a thread is pinned. */
function PinnedComments() {
  const ctx = usePinnedCommentThreads();
  return ctx?.pinned.length ? <PinnedCommentThreads /> : null;
}

/**
 * The app-wide providers (Firebase, data, routing, modals, search, toasts)
 * around the routed page, plus the context modals any page can open.
 */
export function AppProviders(props: {children: ComponentChildren}) {
  useEffect(() => preloadCommonModals(), []);
  return (
    <>
      <FirebaseContext.Provider value={window.firebase}>
        <SSEProvider>
          <SiteSettingsProvider>
            <PendingReleasesProvider>
              <UserPreferencesProvider>
                <ThemeLoader />
                {/*
                    NOTE: <LocationProvider> must wrap <ModalsProvider>. The
                    modals provider renders the currently open modal as a
                    sibling of its children, so any modal that uses the router
                    (e.g. `useLocation().route`) only sees the location context
                    if the location provider is the outer one.
                  */}
                <LocationProvider>
                  <PinnedCommentThreadsProvider>
                    <ModalsProvider modals={APP_MODALS}>
                      <GlobalSearch>
                        {props.children}
                        <PinnedComments />
                      </GlobalSearch>
                    </ModalsProvider>
                  </PinnedCommentThreadsProvider>
                </LocationProvider>
              </UserPreferencesProvider>
            </PendingReleasesProvider>
          </SiteSettingsProvider>
        </SSEProvider>
      </FirebaseContext.Provider>
      <Toaster />
    </>
  );
}
