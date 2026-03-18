import './styles/global.css';
import './styles/theme.css';

import {MantineProvider} from '@mantine/core';
import {ModalsProvider} from '@mantine/modals';
import {NotificationsProvider} from '@mantine/notifications';
import {initializeApp} from 'firebase/app';
import {User, getAuth} from 'firebase/auth';
import {initializeFirestore} from 'firebase/firestore';
import {getStorage} from 'firebase/storage';
import {render, FunctionComponent} from 'preact';
import {LocationProvider, Router, Route, lazy} from 'preact-iso';
import type {CMSBuiltInSidebarTool} from '../core/plugin.js';
import {Collection} from '../core/schema.js';
import {AddToReleaseModal} from './components/AddToReleaseModal/AddToReleaseModal.js';
import {AiEditModal} from './components/AiEditModal/AiEditModal.js';
import {CopyDocModal} from './components/CopyDocModal/CopyDocModal.js';
import {DataSourceSelectModal} from './components/DataSourceSelectModal/DataSourceSelectModal.js';
import {DocPickerModal} from './components/DocPickerModal/DocPickerModal.js';
import {EditJsonModal} from './components/EditJsonModal/EditJsonModal.js';
import {EditTranslationsModal} from './components/EditTranslationsModal/EditTranslationsModal.js';
import {ExportSheetModal} from './components/ExportSheetModal/ExportSheetModal.js';
import {LocalizationModal} from './components/LocalizationModal/LocalizationModal.js';
import {LockPublishingModal} from './components/LockPublishingModal/LockPublishingModal.js';
import {PublishDocModal} from './components/PublishDocModal/PublishDocModal.js';
import {ReferenceFieldEditorModal} from './components/ReferenceFieldEditorModal/ReferenceFieldEditorModal.js';
import {ScheduleReleaseModal} from './components/ScheduleReleaseModal/ScheduleReleaseModal.js';
import {VersionHistoryModal} from './components/VersionHistoryModal/VersionHistoryModal.js';
import {FirebaseContext, FirebaseContextObject} from './hooks/useFirebase.js';
import {SiteSettingsProvider} from './hooks/useSiteSettings.js';
import {SSEProvider} from './hooks/useSSE.js';
import {UserPreferencesProvider} from './hooks/useUserPreferences.js';

/** Lazy-loads a named component export for use as a route component. */
function lazyRoute<P>(
  factory: () => Promise<FunctionComponent<P>>
): FunctionComponent<P> {
  return lazy(() =>
    factory().then((component) => ({default: component}))
  ) as unknown as FunctionComponent<P>;
}

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
const TranslationsArbPage = lazyRoute(() =>
  import('./pages/TranslationsArbPage/TranslationsArbPage.js').then(
    (m) => m.TranslationsArbPage
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
          urlFormat?: string;
          groups?: Record<string, {label?: string; locales: string[]}>;
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
      };
      preview: {
        channel: true | false | 'to-preview' | 'from-preview';
      };
    };
    firebase: FirebaseContextObject;
  }
}

function App() {
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
              <UserPreferencesProvider>
                <ModalsProvider
                  modals={{
                    [AddToReleaseModal.id]: AddToReleaseModal,
                    [AiEditModal.id]: AiEditModal,
                    [CopyDocModal.id]: CopyDocModal,
                    [DocPickerModal.id]: DocPickerModal,
                    [DataSourceSelectModal.id]: DataSourceSelectModal,
                    [EditJsonModal.id]: EditJsonModal,
                    [EditTranslationsModal.id]: EditTranslationsModal,
                    [ExportSheetModal.id]: ExportSheetModal,
                    [LocalizationModal.id]: LocalizationModal,
                    [LockPublishingModal.id]: LockPublishingModal,
                    [PublishDocModal.id]: PublishDocModal,
                    [ReferenceFieldEditorModal.id]: ReferenceFieldEditorModal,
                    [ScheduleReleaseModal.id]: ScheduleReleaseModal,
                    [VersionHistoryModal.id]: VersionHistoryModal,
                  }}
                >
                  <LocationProvider>
                    <Router>
                      <Route path="/cms" component={ProjectPage} />
                      <Route path="/cms/ai" component={AIPage} />
                      <Route path="/cms/assets" component={AssetsPage} />
                      <Route path="/cms/compare" component={ComparePage} />
                      <Route
                        path="/cms/content/:collection?"
                        component={CollectionPage}
                      />
                      <Route
                        path="/cms/content/:collection/:slug"
                        component={DocumentPage}
                      />
                      <Route path="/cms/data" component={DataPage} />
                      <Route
                        path="/cms/data/new"
                        component={NewDataSourcePage}
                      />
                      <Route path="/cms/data/:id" component={DataSourcePage} />
                      <Route
                        path="/cms/data/:id/edit"
                        component={EditDataSourcePage}
                      />
                      <Route path="/cms/logs" component={LogsPage} />
                      <Route path="/cms/releases" component={ReleasesPage} />
                      <Route
                        path="/cms/releases/new"
                        component={NewReleasePage}
                      />
                      <Route path="/cms/releases/:id" component={ReleasePage} />
                      <Route
                        path="/cms/releases/:id/edit"
                        component={EditReleasePage}
                      />
                      <Route path="/cms/settings" component={SettingsPage} />
                      <Route
                        path="/cms/tools/:id"
                        component={SidebarToolsPage}
                      />
                      <Route
                        path="/cms/translations"
                        component={TranslationsPage}
                      />
                      <Route
                        path="/cms/translations/arb"
                        component={TranslationsArbPage}
                      />
                      <Route
                        path="/cms/translations/:hash"
                        component={TranslationsEditPage}
                      />
                      <Route
                        path="/cms/translations/:collection/:slug"
                        component={DocTranslationsPage}
                      />
                      <Route default component={NotFoundPage} />
                    </Router>
                  </LocationProvider>
                </ModalsProvider>
              </UserPreferencesProvider>
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

const app = initializeApp(window.__ROOT_CTX.firebaseConfig);
const databaseId = window.__ROOT_CTX.firebaseConfig.databaseId || '(default)';
// const db = getFirestore(app);
// NOTE(stevenle): the firestore web channel rpc sometimes has issues in
// collections with a large number of docs. Forcing long polling and disabling
// fetch streams seems to work for some people. This may cause performance
// issues however.
const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
    useFetchStreams: false,
  } as any,
  databaseId
);
const auth = getAuth(app);
const storage = getStorage(app);
auth.onAuthStateChanged((user) => {
  if (!user) {
    loginRedirect();
    return;
  }
  window.firebase = {app, auth, db, storage, user};
  const root = document.getElementById('root')!;
  root.innerHTML = '';
  render(<App />, root);

  updateSession(user);
});

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
