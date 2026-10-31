import {Route, Router} from 'preact-iso';
import {exec} from 'preact-iso/router';
import {LazyRoute, lazyRoute} from './lazy-route.js';

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

interface AppRoute {
  path: string;
  component: LazyRoute<any>;
}

/**
 * Returns the CMS's routes, in match order. The v2 translations manager
 * experiment replaces the translations routes.
 */
function getRoutes(): AppRoute[] {
  const v2TranslationsEnabled = Boolean(
    window.__ROOT_CTX.experiments?.v2TranslationsManager
  );
  const translationsRoutes: AppRoute[] = v2TranslationsEnabled
    ? [
        {path: '/cms/translations', component: TranslationsManagerPage},
        {
          path: '/cms/translations/:translationsId*',
          component: TranslationsManagerEditPage,
        },
      ]
    : [
        {path: '/cms/translations', component: TranslationsPage},
        {path: '/cms/translations/arb', component: TranslationsArbPage},
        {path: '/cms/translations/:hash', component: TranslationsEditPage},
        {
          path: '/cms/translations/:collection/:slug',
          component: DocTranslationsPage,
        },
      ];
  return [
    {path: '/cms', component: ProjectPage},
    {path: '/cms/ai', component: AIPage},
    {path: '/cms/ai/chat/:chatId', component: AIPage},
    {path: '/cms/assets', component: AssetsPage},
    {path: '/cms/compare', component: ComparePage},
    {path: '/cms/content/:collection?', component: CollectionPage},
    {path: '/cms/content/:collection/:slug', component: DocumentPage},
    {
      path: '/cms/embed/content/:collection/:slug',
      component: EmbeddedDocumentPage,
    },
    {path: '/cms/embed/ai', component: EmbeddedAIPage},
    {path: '/cms/data', component: DataPage},
    {path: '/cms/data/new', component: NewDataSourcePage},
    {path: '/cms/data/:id', component: DataSourcePage},
    {path: '/cms/data/:id/edit', component: EditDataSourcePage},
    {path: '/cms/logs', component: LogsPage},
    {path: '/cms/logs/errors', component: ErrorLogsPage},
    {path: '/cms/releases', component: ReleasesPage},
    {path: '/cms/releases/new', component: NewReleasePage},
    {path: '/cms/releases/:id', component: ReleasePage},
    {path: '/cms/releases/:id/edit', component: EditReleasePage},
    {path: '/cms/settings', component: SettingsPage},
    {path: '/cms/tasks', component: TasksPage},
    {path: '/cms/tasks/:id', component: TaskPage},
    {path: '/cms/tools/:id/:rest*', component: SidebarToolsPage},
    ...translationsRoutes,
    {
      path: '/cms/_ui/:entryId?',
      component: IS_DEV_SERVER ? GalleryPage : NotFoundPage,
    },
  ];
}

/**
 * Starts loading the chunk for a route. The router only renders once Firebase
 * Auth reports the user, so calling this at startup keeps the chunk from
 * waiting on that network request.
 */
export function preloadRoute(pathname: string) {
  try {
    const route = getRoutes().find((r) => exec(pathname, r.path));
    (route?.component ?? NotFoundPage).preload();
  } catch {
    // `exec()` throws on URLs it can't decode. Preloading is only an
    // optimization, so leave it to the router to show the error.
  }
}

/**
 * The CMS's routes.
 *
 * NOTE: the routes must not have keys. `/cms/ai` and `/cms/ai/chat/:chatId`
 * share a component, and moving between them must not remount it.
 */
export function AppRoutes() {
  return (
    <Router>
      {getRoutes().map((route) => (
        <Route path={route.path} component={route.component} />
      ))}
      <Route default component={NotFoundPage} />
    </Router>
  );
}
