import './styles/global.css';
import './styles/theme.css';

import {MantineProvider} from '@mantine/core';
import {ModalsProvider} from '@mantine/modals';
import {NotificationsProvider} from '@mantine/notifications';
import {initializeApp} from 'firebase/app';
import {User, getAuth} from 'firebase/auth';
import {initializeFirestore} from 'firebase/firestore';
import {getStorage} from 'firebase/storage';
import {render} from 'preact';
import {Route, Router} from 'preact-router';
import type {CMSBuiltInSidebarTool} from '../core/plugin.js';
import {Collection} from '../core/schema.js';
import {AiEditModal} from './components/AiEditModal/AiEditModal.js';
import {CopyDocModal} from './components/CopyDocModal/CopyDocModal.js';
import {DataSourceSelectModal} from './components/DataSourceSelectModal/DataSourceSelectModal.js';
import {DocPickerModal} from './components/DocPickerModal/DocPickerModal.js';
import {DocSelectModal} from './components/DocSelectModal/DocSelectModal.js';
import {EditJsonModal} from './components/EditJsonModal/EditJsonModal.js';
import {EditTranslationsModal} from './components/EditTranslationsModal/EditTranslationsModal.js';
import {ExportSheetModal} from './components/ExportSheetModal/ExportSheetModal.js';
import {LocalizationModal} from './components/LocalizationModal/LocalizationModal.js';
import {LockPublishingModal} from './components/LockPublishingModal/LockPublishingModal.js';
import {PublishDocModal} from './components/PublishDocModal/PublishDocModal.js';
import {ScheduleReleaseModal} from './components/ScheduleReleaseModal/ScheduleReleaseModal.js';
import {VersionHistoryModal} from './components/VersionHistoryModal/VersionHistoryModal.js';
import {FirebaseContext, FirebaseContextObject} from './hooks/useFirebase.js';
import {SiteSettingsProvider} from './hooks/useSiteSettings.js';
import {SSEProvider} from './hooks/useSSE.js';
import {UserPreferencesProvider} from './hooks/useUserPreferences.js';
import {AIPage} from './pages/AIPage/AIPage.js';
import {AssetsPage} from './pages/AssetsPage/AssetsPage.js';
import {CollectionPage} from './pages/CollectionPage/CollectionPage.js';
import {ComparePage} from './pages/ComparePage/ComparePage.js';
import {DataPage} from './pages/DataPage/DataPage.js';
import {DataSourcePage} from './pages/DataSourcePage/DataSourcePage.js';
import {DocTranslationsPage} from './pages/DocTranslationsPage/DocTranslationsPage.js';
import {DocumentPage} from './pages/DocumentPage/DocumentPage.js';
import {EditDataSourcePage} from './pages/EditDataSourcePage/EditDataSourcePage.js';
import {EditReleasePage} from './pages/EditReleasePage/EditReleasePage.js';
import {LogsPage} from './pages/LogsPage/LogsPage.js';
import {NewDataSourcePage} from './pages/NewDataSourcePage/NewDataSourcePage.js';
import {NewReleasePage} from './pages/NewReleasePage/NewReleasePage.js';
import {NotFoundPage} from './pages/NotFoundPage/NotFoundPage.js';
import {ProjectPage} from './pages/ProjectPage/ProjectPage.js';
import {ReleasePage} from './pages/ReleasePage/ReleasePage.js';
import {ReleasesPage} from './pages/ReleasesPage/ReleasesPage.js';
import {SettingsPage} from './pages/SettingsPage/SettingsPage.js';
import {SidebarToolsPage} from './pages/SidebarToolsPage/SidebarToolsPage.js';
import {TranslationsArbPage} from './pages/TranslationsArbPage/TranslationsArbPage.js';
import {TranslationsEditPage} from './pages/TranslationsEditPage/TranslationsEditPage.js';
import {TranslationsPage} from './pages/TranslationsPage/TranslationsPage.js';

type CollectionMeta = Omit<Collection, 'fields'>;

declare global {
  interface Window {
    __ROOT_CTX: {
      rootConfig: {
        projectId: string;
        projectName: string;
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
                    [AiEditModal.id]: AiEditModal,
                    [CopyDocModal.id]: CopyDocModal,
                    [DocPickerModal.id]: DocPickerModal,
                    [DocSelectModal.id]: DocSelectModal,
                    [DataSourceSelectModal.id]: DataSourceSelectModal,
                    [EditJsonModal.id]: EditJsonModal,
                    [EditTranslationsModal.id]: EditTranslationsModal,
                    [ExportSheetModal.id]: ExportSheetModal,
                    [LocalizationModal.id]: LocalizationModal,
                    [LockPublishingModal.id]: LockPublishingModal,
                    [PublishDocModal.id]: PublishDocModal,
                    [ScheduleReleaseModal.id]: ScheduleReleaseModal,
                    [VersionHistoryModal.id]: VersionHistoryModal,
                  }}
                >
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
                    <Route path="/cms/data/new" component={NewDataSourcePage} />
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
                    <Route path="/cms/tools/:id" component={SidebarToolsPage} />
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
