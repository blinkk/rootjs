import {Route, Router} from 'preact-iso';
import {lazyRoute} from './lazy-route.js';

const AIPage = lazyRoute(() =>
  import('../features/ai/pages/AIPage/AIPage.js').then((m) => m.AIPage)
);
const AssetsPage = lazyRoute(() =>
  import('../features/assets/pages/AssetsPage/AssetsPage.js').then(
    (m) => m.AssetsPage
  )
);
const CollectionPage = lazyRoute(() =>
  import('../features/collections/pages/CollectionPage/CollectionPage.js').then(
    (m) => m.CollectionPage
  )
);
const ComparePage = lazyRoute(() =>
  import('../features/documents/pages/ComparePage/ComparePage.js').then(
    (m) => m.ComparePage
  )
);
const DataPage = lazyRoute(() =>
  import('../features/data-sources/pages/DataPage/DataPage.js').then(
    (m) => m.DataPage
  )
);
const DataSourcePage = lazyRoute(() =>
  import('../features/data-sources/pages/DataSourcePage/DataSourcePage.js').then(
    (m) => m.DataSourcePage
  )
);
const DocTranslationsPage = lazyRoute(() =>
  import('../features/translations/pages/DocTranslationsPage/DocTranslationsPage.js').then(
    (m) => m.DocTranslationsPage
  )
);
const DocumentPage = lazyRoute(() =>
  import('../features/documents/pages/DocumentPage/DocumentPage.js').then(
    (m) => m.DocumentPage
  )
);
const EditDataSourcePage = lazyRoute(() =>
  import('../features/data-sources/pages/EditDataSourcePage/EditDataSourcePage.js').then(
    (m) => m.EditDataSourcePage
  )
);
const EmbeddedAIPage = lazyRoute(
  () =>
    import('../features/ai/pages/EmbeddedAIPage/EmbeddedAIPage.js').then(
      (m) => m.EmbeddedAIPage
    ),
  {frame: false}
);
const EmbeddedDocumentPage = lazyRoute(
  () =>
    import('../features/documents/pages/EmbeddedDocumentPage/EmbeddedDocumentPage.js').then(
      (m) => m.EmbeddedDocumentPage
    ),
  {frame: false}
);
const EditReleasePage = lazyRoute(() =>
  import('../features/releases/pages/EditReleasePage/EditReleasePage.js').then(
    (m) => m.EditReleasePage
  )
);
const ErrorLogsPage = lazyRoute(() =>
  import('../features/logs/pages/ErrorLogsPage/ErrorLogsPage.js').then(
    (m) => m.ErrorLogsPage
  )
);
const LogsPage = lazyRoute(() =>
  import('../features/logs/pages/LogsPage/LogsPage.js').then((m) => m.LogsPage)
);
const NewDataSourcePage = lazyRoute(() =>
  import('../features/data-sources/pages/NewDataSourcePage/NewDataSourcePage.js').then(
    (m) => m.NewDataSourcePage
  )
);
const NewReleasePage = lazyRoute(() =>
  import('../features/releases/pages/NewReleasePage/NewReleasePage.js').then(
    (m) => m.NewReleasePage
  )
);
const GalleryPage = lazyRoute(() =>
  import('../dev/gallery/GalleryPage.js').then((m) => m.GalleryPage)
);
const NotFoundPage = lazyRoute(() =>
  import('./NotFoundPage/NotFoundPage.js').then((m) => m.NotFoundPage)
);
const ProjectPage = lazyRoute(() =>
  import('../features/collections/pages/ProjectPage/ProjectPage.js').then(
    (m) => m.ProjectPage
  )
);
const ReleasePage = lazyRoute(() =>
  import('../features/releases/pages/ReleasePage/ReleasePage.js').then(
    (m) => m.ReleasePage
  )
);
const ReleasesPage = lazyRoute(() =>
  import('../features/releases/pages/ReleasesPage/ReleasesPage.js').then(
    (m) => m.ReleasesPage
  )
);
const SettingsPage = lazyRoute(() =>
  import('../features/settings/pages/SettingsPage/SettingsPage.js').then(
    (m) => m.SettingsPage
  )
);
const SidebarToolsPage = lazyRoute(() =>
  import('../features/sidebar-tools/pages/SidebarToolsPage/SidebarToolsPage.js').then(
    (m) => m.SidebarToolsPage
  )
);
const TaskPage = lazyRoute(() =>
  import('../features/tasks/pages/TaskPage/TaskPage.js').then((m) => m.TaskPage)
);
const TasksPage = lazyRoute(() =>
  import('../features/tasks/pages/TasksPage/TasksPage.js').then(
    (m) => m.TasksPage
  )
);
const TranslationsArbPage = lazyRoute(() =>
  import('../features/translations/pages/TranslationsArbPage/TranslationsArbPage.js').then(
    (m) => m.TranslationsArbPage
  )
);
const TranslationsManagerEditPage = lazyRoute(() =>
  import('../features/translations/pages/TranslationsManagerEditPage/TranslationsManagerEditPage.js').then(
    (m) => m.TranslationsManagerEditPage
  )
);
const TranslationsManagerPage = lazyRoute(() =>
  import('../features/translations/pages/TranslationsManagerPage/TranslationsManagerPage.js').then(
    (m) => m.TranslationsManagerPage
  )
);
const TranslationsEditPage = lazyRoute(() =>
  import('../features/translations/pages/TranslationsEditPage/TranslationsEditPage.js').then(
    (m) => m.TranslationsEditPage
  )
);
const TranslationsPage = lazyRoute(() =>
  import('../features/translations/pages/TranslationsPage/TranslationsPage.js').then(
    (m) => m.TranslationsPage
  )
);

/**
 * Whether the CMS is running on the dev server (`root dev`), which enables
 * dev-only tools like the UI gallery at `/cms/_ui`.
 */
const IS_DEV_SERVER = !window.__ROOT_CTX.build;

/** The CMS's routes. */
export function AppRoutes() {
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
    <Router>
      <Route path="/cms" component={ProjectPage} />
      <Route path="/cms/ai" component={AIPage} />
      <Route path="/cms/ai/chat/:chatId" component={AIPage} />
      <Route path="/cms/assets" component={AssetsPage} />
      <Route path="/cms/compare" component={ComparePage} />
      <Route path="/cms/content/:collection?" component={CollectionPage} />
      <Route path="/cms/content/:collection/:slug" component={DocumentPage} />
      <Route
        path="/cms/embed/content/:collection/:slug"
        component={EmbeddedDocumentPage}
      />
      <Route path="/cms/embed/ai" component={EmbeddedAIPage} />
      <Route path="/cms/data" component={DataPage} />
      <Route path="/cms/data/new" component={NewDataSourcePage} />
      <Route path="/cms/data/:id" component={DataSourcePage} />
      <Route path="/cms/data/:id/edit" component={EditDataSourcePage} />
      <Route path="/cms/logs" component={LogsPage} />
      <Route path="/cms/logs/errors" component={ErrorLogsPage} />
      <Route path="/cms/releases" component={ReleasesPage} />
      <Route path="/cms/releases/new" component={NewReleasePage} />
      <Route path="/cms/releases/:id" component={ReleasePage} />
      <Route path="/cms/releases/:id/edit" component={EditReleasePage} />
      <Route path="/cms/settings" component={SettingsPage} />
      <Route path="/cms/tasks" component={TasksPage} />
      <Route path="/cms/tasks/:id" component={TaskPage} />
      <Route path="/cms/tools/:id/:rest*" component={SidebarToolsPage} />
      {translationsRoutes}
      <Route
        path="/cms/_ui/:entryId?"
        component={IS_DEV_SERVER ? GalleryPage : NotFoundPage}
      />
      <Route default component={NotFoundPage} />
    </Router>
  );
}
