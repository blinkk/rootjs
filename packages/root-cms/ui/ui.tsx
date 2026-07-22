import './styles/global.css';
import './styles/theme.css';

import {MantineProvider} from '@mantine/core';
import {ModalsProvider} from '@mantine/modals';
import {NotificationsProvider} from '@mantine/notifications';
import {initializeApp} from 'firebase/app';
import {User, getAuth} from 'firebase/auth';
import {
  Firestore,
  doc,
  initializeFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {getStorage} from 'firebase/storage';
import {render} from 'preact';
import {LocationProvider, Router, Route} from 'preact-iso';
import type {CMSBuiltInSidebarTool} from '../core/plugin.js';
import {Collection} from '../core/schema.js';
import {AddToReleaseModal} from './components/AddToReleaseModal/AddToReleaseModal.js';
import {AiEditModal} from './components/AiEditModal/AiEditModal.js';
import {AppErrorBoundary} from './components/AppErrorBoundary/AppErrorBoundary.js';
import {AssetPickerModal} from './components/AssetPickerModal/AssetPickerModal.js';
import {CompareDraftModal} from './components/CompareDraftModal/CompareDraftModal.js';
import {ComponentPickerModal} from './components/ComponentPickerModal/ComponentPickerModal.js';
import {CopyDocModal} from './components/CopyDocModal/CopyDocModal.js';
import {DataSourceSelectModal} from './components/DataSourceSelectModal/DataSourceSelectModal.js';
import {DocPickerModal} from './components/DocPickerModal/DocPickerModal.js';
import {EditJsonModal} from './components/EditJsonModal/EditJsonModal.js';
import {EditTranslationsModal} from './components/EditTranslationsModal/EditTranslationsModal.js';
import {ExportSheetModal} from './components/ExportSheetModal/ExportSheetModal.js';
import {GlobalSearch} from './components/GlobalSearch/GlobalSearch.js';
import {LocalizationModal} from './components/LocalizationModal/LocalizationModal.js';
import {LockPublishingModal} from './components/LockPublishingModal/LockPublishingModal.js';
import {PruneTranslationsModal} from './components/PruneTranslationsModal/PruneTranslationsModal.js';
import {PublishDocModal} from './components/PublishDocModal/PublishDocModal.js';
import {ReferenceFieldEditorModal} from './components/ReferenceFieldEditorModal/ReferenceFieldEditorModal.js';
import {ScheduleReleaseModal} from './components/ScheduleReleaseModal/ScheduleReleaseModal.js';
import {VersionHistoryModal} from './components/VersionHistoryModal/VersionHistoryModal.js';
import {FirebaseContext, FirebaseContextObject} from './hooks/useFirebase.js';
import {PendingReleasesProvider} from './hooks/usePendingReleases.js';
import {SiteSettingsProvider} from './hooks/useSiteSettings.js';
import {SSEProvider} from './hooks/useSSE.js';
import {UserPreferencesProvider} from './hooks/useUserPreferences.js';
import {lazyRoute} from './utils/lazy-route.js';
import {installNavigationGuards} from './utils/navigation-guard.js';

const AIPage = lazyRoute(() =>
  import('./pages/AIPage/AIPage.js').then((m) => m.AIPage)
);
const AssetsPage = lazyRoute(() =>
  import('./pages/AssetsPage/AssetsPage.js').then((m) => m.AssetsPage)
);
const CollectionPage = lazyRoute(() =>
  import('./pages/CollectionPage/CollectionPage.js').then(
    (m) => m.CollectionPage
  )
);
const ComparePage = lazyRoute(() =>
  import('./pages/ComparePage/ComparePage.js').then((m) => m.ComparePage)
);
const DataPage = lazyRoute(() =>
  import('./pages/DataPage/DataPage.js').then((m) => m.DataPage)
);
const DataSourcePage = lazyRoute(() =>
  import('./pages/DataSourcePage/DataSourcePage.js').then(
    (m) => m.DataSourcePage
  )
);
const DocTranslationsPage = lazyRoute(() =>
  import('./pages/DocTranslationsPage/DocTranslationsPage.js').then(
    (m) => m.DocTranslationsPage
  )
);
const DocumentPage = lazyRoute(() =>
  import('./pages/DocumentPage/DocumentPage.js').then((m) => m.DocumentPage)
);
const EditDataSourcePage = lazyRoute(() =>
  import('./pages/EditDataSourcePage/EditDataSourcePage.js').then(
    (m) => m.EditDataSourcePage
  )
);
const EmbeddedAIPage = lazyRoute(
  () =>
    import('./pages/EmbeddedAIPage/EmbeddedAIPage.js').then(
      (m) => m.EmbeddedAIPage
    ),
  {frame: false}
);
const EmbeddedDocumentPage = lazyRoute(
  () =>
    import('./pages/EmbeddedDocumentPage/EmbeddedDocumentPage.js').then(
      (m) => m.EmbeddedDocumentPage
    ),
  {frame: false}
);
const EditReleasePage = lazyRoute(() =>
  import('./pages/EditReleasePage/EditReleasePage.js').then(
    (m) => m.EditReleasePage
  )
);
const LogsPage = lazyRoute(() =>
  import('./pages/LogsPage/LogsPage.js').then((m) => m.LogsPage)
);
const NewDataSourcePage = lazyRoute(() =>
  import('./pages/NewDataSourcePage/NewDataSourcePage.js').then(
    (m) => m.NewDataSourcePage
  )
);
const NewReleasePage = lazyRoute(() =>
  import('./pages/NewReleasePage/NewReleasePage.js').then(
    (m) => m.NewReleasePage
  )
);
const NotFoundPage = lazyRoute(() =>
  import('./pages/NotFoundPage/NotFoundPage.js').then((m) => m.NotFoundPage)
);
const ProjectPage = lazyRoute(() =>
  import('./pages/ProjectPage/ProjectPage.js').then((m) => m.ProjectPage)
);
const ReleasePage = lazyRoute(() =>
  import('./pages/ReleasePage/ReleasePage.js').then((m) => m.ReleasePage)
);
const ReleasesPage = lazyRoute(() =>
  import('./pages/ReleasesPage/ReleasesPage.js').then((m) => m.ReleasesPage)
);
const SettingsPage = lazyRoute(() =>
  import('./pages/SettingsPage/SettingsPage.js').then((m) => m.SettingsPage)
);
const SidebarToolsPage = lazyRoute(() =>
  import('./pages/SidebarToolsPage/SidebarToolsPage.js').then(
    (m) => m.SidebarToolsPage
  )
);
const TaskPage = lazyRoute(() =>
  import('./pages/TaskPage/TaskPage.js').then((m) => m.TaskPage)
);
const TasksPage = lazyRoute(() =>
  import('./pages/TasksPage/TasksPage.js').then((m) => m.TasksPage)
);
const TranslationsArbPage = lazyRoute(() =>
  import('./pages/TranslationsArbPage/TranslationsArbPage.js').then(
    (m) => m.TranslationsArbPage
  )
);
const TranslationsManagerEditPage = lazyRoute(() =>
  import('./pages/TranslationsManagerEditPage/TranslationsManagerEditPage.js').then(
    (m) => m.TranslationsManagerEditPage
  )
);
const TranslationsManagerPage = lazyRoute(() =>
  import('./pages/TranslationsManagerPage/TranslationsManagerPage.js').then(
    (m) => m.TranslationsManagerPage
  )
);
const TranslationsEditPage = lazyRoute(() =>
  import('./pages/TranslationsEditPage/TranslationsEditPage.js').then(
    (m) => m.TranslationsEditPage
  )
);
const TranslationsPage = lazyRoute(() =>
  import('./pages/TranslationsPage/TranslationsPage.js').then(
    (m) => m.TranslationsPage
  )
);

type CollectionMeta = Omit<Collection, 'fields'>;

declare global {
  interface Window {
    __ROOT_CTX: {
      rootConfig: {
        projectId: string;
        projectName: string;
        minimalBranding: boolean;
        domain: string;
        base: string;
        gci: string | boolean;
        i18n: {
          locales?: string[];
          defaultLocale?: string;
          urlFormat?: string;
          groups?: Record<string, {label?: string; locales: string[]}>;
          translationLanguages?: Record<string, string>;
          fallbacks?: Record<string, string[]>;
        };
        server: {
          trailingSlash?: boolean;
        };
      };
      firebaseConfig: Record<string, string>;
      gapi?: {
        apiKey: string;
        clientId: string;
      };
      collections: Record<string, CollectionMeta>;
      sidebar?: {
        hiddenBuiltInTools?: CMSBuiltInSidebarTool[];
        tools?: Record<
          string,
          {
            icon?: string;
            label?: string;
            iframeUrl?: string;
            cmsUrl?: string;
            externalUrl?: string;
          }
        >;
      };
      experiments?: {
        ai?: boolean | {endpoint?: string};
        taskManager?: boolean;
        v2TranslationsManager?: boolean;
      };
      ai?: {
        defaultModel?: string;
        imageGenerationEnabled?: boolean;
        models: Array<{
          id: string;
          label: string;
          description?: string;
          provider: string;
          capabilities: {
            tools: boolean;
            reasoning: boolean;
            attachments: boolean;
          };
        }>;
      } | null;
      preview: {
        channel: true | false | 'to-preview' | 'from-preview';
      };
      /** Checks registered via the CMS plugin config. */
      checks?: Array<{
        id: string;
        label: string;
        description?: string;
        collections?: string[];
      }>;
      /** Translation services registered via the CMS plugin config. */
      translations?: Array<{
        id: string;
        label: string;
        icon?: string;
        hasImport: boolean;
        hasExport: boolean;
      }>;
      /** Default UI variant for `oneOf` fields. */
      defaultOneOfVariant?: 'dropdown' | 'picker';
      /**
       * Locales to exclude from translation import/export. Patterns support
       * wildcards, e.g. `ALL_*`.
       */
      excludeLocalesFromTranslations?: string[];
      /**
       * Origins allowed to embed the CMS in an iframe (e.g. the headless doc
       * editor). Used to validate inbound postMessages and target outbound
       * lifecycle messages from the embedded editor.
       */
      allowedIframeOrigins?: string[];
      /**
       * Whether the dependency graph is enabled via the `dependencyGraph`
       * cmsPlugin option. When enabled, the UI notifies the server after
       * client-side publishes so the graph is updated immediately.
       */
      dependencyGraphEnabled?: boolean;
    };
    firebase: FirebaseContextObject;
  }
}

function App() {
  const v2TranslationsEnabled = Boolean(
    window.__ROOT_CTX.experiments?.v2TranslationsManager
  );
  // NOTE: conditional route children must be arrays (not fragments) —
  // preact-iso's Router only flattens arrays.
  const translationsRoutes = v2TranslationsEnabled
    ? [
        <Route
          key="translations"
          path="/cms/translations"
          component={TranslationsManagerPage}
        />,
        <Route
          key="translations-edit"
          path="/cms/translations/:translationsId*"
          component={TranslationsManagerEditPage}
        />,
      ]
    : [
        <Route
          key="translations"
          path="/cms/translations"
          component={TranslationsPage}
        />,
        <Route
          key="translations-arb"
          path="/cms/translations/arb"
          component={TranslationsArbPage}
        />,
        <Route
          key="translations-hash"
          path="/cms/translations/:hash"
          component={TranslationsEditPage}
        />,
        <Route
          key="translations-doc"
          path="/cms/translations/:collection/:slug"
          component={DocTranslationsPage}
        />,
      ];
  return (
    <MantineProvider
      theme={{
        fontFamily: 'Inter, sans-serif',
        fontSizes: {xs: 12, sm: 14, md: 16, lg: 18, xl: 20},
      }}
    >
      <NotificationsProvider>
        <FirebaseContext.Provider value={window.firebase}>
          <SSEProvider>
            <SiteSettingsProvider>
              <PendingReleasesProvider>
                <UserPreferencesProvider>
                  <ModalsProvider
                    modals={{
                      [AddToReleaseModal.id]: AddToReleaseModal,
                      [AiEditModal.id]: AiEditModal,
                      [AssetPickerModal.id]: AssetPickerModal,
                      [CompareDraftModal.id]: CompareDraftModal,
                      [ComponentPickerModal.id]: ComponentPickerModal,
                      [CopyDocModal.id]: CopyDocModal,
                      [DocPickerModal.id]: DocPickerModal,
                      [DataSourceSelectModal.id]: DataSourceSelectModal,
                      [EditJsonModal.id]: EditJsonModal,
                      [EditTranslationsModal.id]: EditTranslationsModal,
                      [ExportSheetModal.id]: ExportSheetModal,
                      [LocalizationModal.id]: LocalizationModal,
                      [LockPublishingModal.id]: LockPublishingModal,
                      [PruneTranslationsModal.id]: PruneTranslationsModal,
                      [PublishDocModal.id]: PublishDocModal,
                      [ReferenceFieldEditorModal.id]: ReferenceFieldEditorModal,
                      [ScheduleReleaseModal.id]: ScheduleReleaseModal,
                      [VersionHistoryModal.id]: VersionHistoryModal,
                    }}
                  >
                    <LocationProvider>
                      <GlobalSearch>
                        <AppErrorBoundary>
                          <Router>
                            <Route path="/cms" component={ProjectPage} />
                            <Route path="/cms/ai" component={AIPage} />
                            <Route
                              path="/cms/ai/chat/:chatId"
                              component={AIPage}
                            />
                            <Route path="/cms/assets" component={AssetsPage} />
                            <Route
                              path="/cms/compare"
                              component={ComparePage}
                            />
                            <Route
                              path="/cms/content/:collection?"
                              component={CollectionPage}
                            />
                            <Route
                              path="/cms/content/:collection/:slug"
                              component={DocumentPage}
                            />
                            <Route
                              path="/cms/embed/content/:collection/:slug"
                              component={EmbeddedDocumentPage}
                            />
                            <Route
                              path="/cms/embed/ai"
                              component={EmbeddedAIPage}
                            />
                            <Route path="/cms/data" component={DataPage} />
                            <Route
                              path="/cms/data/new"
                              component={NewDataSourcePage}
                            />
                            <Route
                              path="/cms/data/:id"
                              component={DataSourcePage}
                            />
                            <Route
                              path="/cms/data/:id/edit"
                              component={EditDataSourcePage}
                            />
                            <Route path="/cms/logs" component={LogsPage} />
                            <Route
                              path="/cms/releases"
                              component={ReleasesPage}
                            />
                            <Route
                              path="/cms/releases/new"
                              component={NewReleasePage}
                            />
                            <Route
                              path="/cms/releases/:id"
                              component={ReleasePage}
                            />
                            <Route
                              path="/cms/releases/:id/edit"
                              component={EditReleasePage}
                            />
                            <Route
                              path="/cms/settings"
                              component={SettingsPage}
                            />
                            <Route path="/cms/tasks" component={TasksPage} />
                            <Route path="/cms/tasks/:id" component={TaskPage} />
                            <Route
                              path="/cms/tools/:id/:rest*"
                              component={SidebarToolsPage}
                            />
                            {translationsRoutes}
                            <Route default component={NotFoundPage} />
                          </Router>
                        </AppErrorBoundary>
                      </GlobalSearch>
                    </LocationProvider>
                  </ModalsProvider>
                </UserPreferencesProvider>
              </PendingReleasesProvider>
            </SiteSettingsProvider>
          </SSEProvider>
        </FirebaseContext.Provider>
      </NotificationsProvider>
    </MantineProvider>
  );
}

function loginRedirect() {
  let originalUrl = window.location.pathname;
  if (window.location.search) {
    originalUrl = `${originalUrl}?${window.location.search}`;
  }
  const params = new URLSearchParams({continue: originalUrl});
  window.location.replace(`/cms/login?${params.toString()}`);
}

function registerDevServerRedirectShortcut() {
  window.addEventListener('keydown', (event: KeyboardEvent) => {
    const isShortcutPressed =
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === 'd';
    if (!isShortcutPressed) {
      return;
    }

    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    if (isLocalhost) {
      return;
    }

    event.preventDefault();
    const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.assign(`http://localhost:4007${path}`);
  });
}

registerDevServerRedirectShortcut();

// Install the unsaved-changes navigation guards before the app renders so
// the guard listeners run ahead of preact-iso's click/popstate listeners.
installNavigationGuards();

const root = document.getElementById('root')!;

/**
 * Max time to wait for Firebase Auth to report the auth state before showing
 * an error screen. Without a deadline, a stalled auth request would leave the
 * "Loading..." screen up indefinitely with no way to tell what went wrong.
 */
const AUTH_STATE_TIMEOUT_MS = 15 * 1000;

function getStartupErrorMessage(err: any): string {
  const code = err?.code || '';
  if (code === 'auth/invalid-api-key') {
    return 'Firebase API key is invalid.';
  }
  return err?.message || 'An unknown startup error occurred.';
}

function showStartupError(err: any) {
  console.error(err);
  root.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'bootstrap bootstrap--error';

  const title = document.createElement('h1');
  title.className = 'bootstrap__error-title';
  title.textContent = 'Something went wrong';

  const message = document.createElement('p');
  message.className = 'bootstrap__error-message';
  message.textContent = getStartupErrorMessage(err);

  const reloadButton = document.createElement('button');
  reloadButton.type = 'button';
  reloadButton.className = 'bootstrap__error-button';
  reloadButton.textContent = 'Reload page';
  reloadButton.addEventListener('click', () => window.location.reload());

  container.append(title, message, reloadButton);
  root.append(container);
}

try {
  const app = initializeApp(window.__ROOT_CTX.firebaseConfig);
  const databaseId = window.__ROOT_CTX.firebaseConfig.databaseId || '(default)';
  // const db = getFirestore(app);
  // NOTE(stevenle): the firestore web channel rpc sometimes has issues in
  // collections with a large number of docs.
  //
  // We previously forced long polling (`experimentalForceLongPolling: true`)
  // unconditionally as a workaround, but that transport can get into a stuck
  // state where the `channel?gsessionid=...` long-poll session stalls and never
  // completes, leaving requests like getDocs() pending forever (the CMS hangs
  // on a loading spinner until a hard reload). Use auto-detect instead so the
  // SDK prefers the more reliable WebChannel/fetch-stream transport and only
  // falls back to long polling on networks that actually require it.
  const db = initializeFirestore(
    app,
    {
      experimentalAutoDetectLongPolling: true,
    } as any,
    databaseId
  );
  const auth = getAuth(app);
  const storage = getStorage(app);
  // Watchdog: if the auth state never arrives (e.g. a stalled network
  // request), replace the loading screen with an error screen instead of
  // spinning forever. If the auth state eventually arrives after the deadline,
  // the app still renders over the error screen and recovers.
  const authWatchdog = window.setTimeout(() => {
    showStartupError(
      new Error(
        'Timed out waiting for Firebase Authentication to respond. Check your network connection and reload the page.'
      )
    );
  }, AUTH_STATE_TIMEOUT_MS);
  auth.onAuthStateChanged(
    (user) => {
      window.clearTimeout(authWatchdog);
      if (!user) {
        loginRedirect();
        return;
      }
      window.firebase = {app, auth, db, storage, user};
      root.innerHTML = '';
      render(<App />, root);

      updateSession(user).catch((err) => {
        console.error('failed to update login session:', err);
      });
      saveUserProfile(user, db);
    },
    (err) => {
      window.clearTimeout(authWatchdog);
      showStartupError(err);
    }
  );
} catch (err) {
  showStartupError(err);
}

async function updateSession(user: User) {
  const idToken = await user.getIdToken();
  const res = await fetch('/cms/login', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({idToken}),
  });
  if (res.status !== 200) {
    console.error('login failed');
    console.log(res);
    return;
  }
  const data = await res.json();
  if (!data.success) {
    console.error('login failed');
    console.log(res);
    return;
  }
}

/**
 * Persists the signed-in user's profile (display name, photo URL) to the DB
 * so other users can render their avatar/name without each client having to
 * re-fetch from the auth provider. Stored at
 * `Projects/<projectId>/UserProfiles/<email>` keyed by email since emails are
 * the canonical identifier used throughout the CMS.
 */
async function saveUserProfile(user: User, db: Firestore) {
  if (!user.email) {
    return;
  }
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const profileRef = doc(db, 'Projects', projectId, 'UserProfiles', user.email);
  try {
    await setDoc(
      profileRef,
      {
        email: user.email,
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        uid: user.uid,
        lastSignedInAt: serverTimestamp(),
      },
      {merge: true}
    );
  } catch (err) {
    console.error('failed to save user profile:', err);
  }
}
