import './Layout.css';

import {
  IconCarrot,
  IconClipboardList,
  IconDatabase,
  IconFolder,
  IconHome,
  IconLanguage,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLogout,
  IconMenu2,
  IconPhoto,
  IconRobot,
  IconRocket,
  IconSettings,
} from '@tabler/icons-preact';
import {ComponentChildren, createContext} from 'preact';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import type {CMSBuiltInSidebarTool} from '../../../core/plugin.js';
import packageJson from '../../../package.json' with {type: 'json'};
import {clearLastSignIn} from '../../../shared/auth-hints.js';
import {RootJsLogo} from '../../components/RootJsLogo/RootJsLogo.js';
import {testAiEnabled} from '../../features/ai/ai.js';
import {SearchBar} from '../../features/search/SearchBar/SearchBar.js';
import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {Avatar} from '../../primitives/Avatar/Avatar.js';
import {Dialog} from '../../primitives/Dialog/Dialog.js';
import {IconButton} from '../../primitives/IconButton/IconButton.js';
import {Menu, MenuDivider, MenuItem} from '../../primitives/Menu/Menu.js';
import {Tooltip} from '../../primitives/Tooltip/Tooltip.js';
import {cn} from '../../utils/classes.js';

const ICON_STROKE = '1.5';

const SIDEBAR_EXPANDED_STORAGE_KEY = 'root::Layout::sidebarExpanded';

/** Matches the `md` breakpoint, where the drawer gives way to the rail. */
const DESKTOP_QUERY = '(width >= 48rem)';

/** State of the left-hand sidebar, shared by the layout and its children. */
interface SidebarState {
  /** Whether the sidebar is expanded to show the link labels. */
  expanded: boolean;
  /** Toggles the sidebar between its expanded and collapsed states. */
  toggle: () => void;
}

const SidebarContext = createContext<SidebarState>({
  expanded: false,
  toggle: () => {},
});

/**
 * Returns the expand/collapse state of the left-hand sidebar. The state is
 * persisted to local storage and defaults to collapsed.
 */
function useSidebar(): SidebarState {
  return useContext(SidebarContext);
}

interface LayoutProps {
  className?: string;
  children?: ComponentChildren;
}

/**
 * The app shell: a header, the navigation and the page. From `md` up the
 * navigation is a rail of icons (expandable to show labels) on the left;
 * below `md` it's a drawer opened from the header's menu button.
 */
export function Layout(props: LayoutProps) {
  const [expanded, setExpanded] = useLocalStorage<boolean>(
    SIDEBAR_EXPANDED_STORAGE_KEY,
    false
  );
  const toggle = useCallback(() => {
    setExpanded((current) => !current);
  }, [setExpanded]);
  const sidebar = useMemo(() => ({expanded, toggle}), [expanded, toggle]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const {url} = useLocation();

  // Close the drawer on navigation, and when the window grows past `md`
  // (where the rail takes over).
  useEffect(() => setDrawerOpen(false), [url]);
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => {
      if (query.matches) {
        setDrawerOpen(false);
      }
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return (
    <SidebarContext.Provider value={sidebar}>
      <div className={cn('Layout', expanded && 'Layout--sidebar-expanded')}>
        <Layout.Top onOpenMenu={() => setDrawerOpen(true)} />
        <Layout.Side />
        <Layout.Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        <Layout.Main {...props}>{props.children}</Layout.Main>
      </div>
    </SidebarContext.Provider>
  );
}

/**
 * Returns true when the current URL is the document editor page
 * (`/cms/content/:collection/:slug`), which has its own custom search and
 * should therefore hide the global search bar.
 */
function isDocumentEditorUrl(url: string): boolean {
  const path = url.split('?')[0].replace(/\/+$/g, '');
  const parts = path.split('/').filter(Boolean);
  return parts.length === 4 && parts[0] === 'cms' && parts[1] === 'content';
}

function getProjectName() {
  const rootConfig = window.__ROOT_CTX.rootConfig;
  return rootConfig.projectName || rootConfig.projectId;
}

Layout.Top = (props: {onOpenMenu: () => void}) => {
  const projectName = getProjectName();
  const minimalBranding = window.__ROOT_CTX.rootConfig.minimalBranding;
  const {url} = useLocation();
  const showSearchBar = !isDocumentEditorUrl(url);
  const logoClassName =
    'Layout__top__logo flex shrink-0 items-center gap-1 rounded-sm px-2 py-1 text-base font-bold leading-none text-fg no-underline hover:bg-surface-hover active:bg-surface-active';
  return (
    <header className="Layout__top flex min-w-0 items-center gap-1 border-b border-border px-2">
      <IconButton
        className="Layout__top__menu md:hidden"
        label="Open menu"
        size="md"
        tooltip={false}
        onClick={props.onOpenMenu}
      >
        <IconMenu2 stroke={ICON_STROKE} />
      </IconButton>
      {!minimalBranding ? (
        <>
          <a className={logoClassName} href="/cms" aria-label="Home">
            <RootJsLogo />
          </a>
          <Layout.Version />
          <div className="Layout__top__project ml-2 min-w-0 truncate text-base font-semibold md:ml-4">
            {projectName}
          </div>
        </>
      ) : (
        <>
          <a className={cn(logoClassName, 'min-w-0 truncate')} href="/cms">
            {projectName}
          </a>
          <Layout.Version />
        </>
      )}
      {showSearchBar && (
        <div className="Layout__top__search ml-auto shrink-0 pl-2 md:pr-2">
          <SearchBar />
        </div>
      )}
    </header>
  );
};

/**
 * The Root.js version badge in the top bar, which links to the changelog.
 * When the app is prebuilt (i.e. deployed, not the dev server), a tooltip
 * shows when the server was built. Hidden on phones, to make room.
 */
Layout.Version = () => {
  const buildTimestamp = window.__ROOT_CTX.build?.timestamp;
  const version = (
    <a
      className="Layout__top__version ml-1.5 hidden shrink-0 rounded-full bg-chip px-2 font-mono text-xs font-bold text-fg no-underline hover:bg-surface-active sm:inline-block"
      href="https://github.com/blinkk/rootjs/blob/main/packages/root-cms/CHANGELOG.md"
      target="_blank"
      rel="noreferrer noopener"
    >
      v{packageJson.version}
    </a>
  );
  if (!buildTimestamp) {
    return version;
  }
  return (
    <Tooltip
      label={`Built ${formatBuildTime(buildTimestamp)}`}
      placement="bottom"
    >
      {version}
    </Tooltip>
  );
};

/** Formats a build timestamp in the user's local time zone. */
function formatBuildTime(timestamp: number) {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

async function signOut() {
  clearLastSignIn();
  await window.firebase.auth.signOut();
  // Go through the logout handler so the server session cookie is cleared
  // too, otherwise the session would stay valid until it expires.
  window.location.href = '/cms/logout';
}

/** The rail of navigation links on the left, from `md` up. */
Layout.Side = () => {
  const {expanded} = useSidebar();
  return (
    <nav
      className="Layout__side hidden flex-col justify-between overflow-hidden border-r border-border py-2 md:flex"
      aria-label="Main"
    >
      <div className="Layout__side__buttons min-h-0 w-full flex-auto overflow-y-auto overflow-x-hidden">
        <Layout.NavLinks expanded={expanded} />
      </div>
      <div className="Layout__side__footer flex w-full flex-none flex-col items-center gap-2 pt-2">
        <Layout.SideToggleButton />
        <Layout.UserMenu expanded={expanded} />
      </div>
    </nav>
  );
};

/** The navigation as an off-canvas drawer, below `md`. */
Layout.Drawer = (props: {open: boolean; onClose: () => void}) => {
  const user = window.firebase.user;
  return (
    <Dialog
      className="Layout__drawer md:hidden"
      classNames={{body: 'px-0 pb-0 flex flex-col'}}
      open={props.open}
      onClose={props.onClose}
      position="left"
      size={280}
      title={getProjectName()}
      closeLabel="Close menu"
    >
      <nav className="Layout__drawer__nav flex-auto" aria-label="Main">
        <Layout.NavLinks expanded />
      </nav>
      <div className="Layout__drawer__user flex flex-col gap-2 border-t border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar src={user.photoURL} alt={user.email!} size="sm" />
          <div className="min-w-0 truncate text-sm text-muted">
            {user.email}
          </div>
        </div>
        <button
          type="button"
          className="Layout__drawer__signOut flex h-control-md appearance-none items-center gap-2 rounded-md border-0 bg-transparent px-2 font-sans text-base text-danger hover:bg-danger-soft focus-visible:ring-2 focus-visible:ring-focus"
          onClick={signOut}
        >
          <IconLogout size={16} />
          Sign out
        </button>
      </div>
    </Dialog>
  );
};

/**
 * The navigation links, shared by the rail and the drawer. With `expanded`
 * the labels show next to the icons; otherwise the labels are tooltips.
 */
Layout.NavLinks = (props: {expanded: boolean}) => {
  const {url} = useLocation();
  const currentUrl = url.replace(/\/*$/g, '');
  const expanded = props.expanded;
  const sidebarTools = window.__ROOT_CTX.sidebar?.tools;
  const hiddenBuiltInTools = new Set<CMSBuiltInSidebarTool>(
    window.__ROOT_CTX.sidebar?.hiddenBuiltInTools || []
  );
  const isBuiltInHidden = (tool: CMSBuiltInSidebarTool) =>
    hiddenBuiltInTools.has(tool);
  const experiments = window.__ROOT_CTX.experiments || {};

  return (
    <>
      {!isBuiltInHidden('home') && (
        <Layout.SideButton
          label="Home"
          url="/cms"
          active={currentUrl === '/cms'}
          expanded={expanded}
        >
          <IconHome stroke={ICON_STROKE} />
        </Layout.SideButton>
      )}

      {!isBuiltInHidden('content') && (
        <Layout.SideButton
          label="Content"
          url="/cms/content"
          active={currentUrl.startsWith('/cms/content')}
          expanded={expanded}
        >
          <IconFolder stroke={ICON_STROKE} />
        </Layout.SideButton>
      )}

      {experiments.taskManager !== false && (
        <Layout.SideButton
          label="Tasks"
          url="/cms/tasks"
          active={currentUrl.startsWith('/cms/tasks')}
          expanded={expanded}
        >
          <IconClipboardList stroke={ICON_STROKE} />
        </Layout.SideButton>
      )}

      {!isBuiltInHidden('releases') && (
        <Layout.SideButton
          label="Releases"
          url="/cms/releases"
          active={currentUrl.startsWith('/cms/releases')}
          expanded={expanded}
        >
          <IconRocket stroke={ICON_STROKE} />
        </Layout.SideButton>
      )}

      {!isBuiltInHidden('data') && (
        <Layout.SideButton
          label="Data"
          url="/cms/data"
          active={currentUrl.startsWith('/cms/data')}
          expanded={expanded}
        >
          <IconDatabase stroke={ICON_STROKE} />
        </Layout.SideButton>
      )}

      {!isBuiltInHidden('assets') && (
        <Layout.SideButton
          label="Asset Library"
          url="/cms/assets"
          active={currentUrl.startsWith('/cms/assets')}
          expanded={expanded}
        >
          <IconPhoto stroke={ICON_STROKE} />
        </Layout.SideButton>
      )}

      {!isBuiltInHidden('translations') && (
        <Layout.SideButton
          label="Translations"
          url="/cms/translations"
          active={currentUrl.startsWith('/cms/translations')}
          expanded={expanded}
        >
          <IconLanguage stroke={ICON_STROKE} />
        </Layout.SideButton>
      )}

      {testAiEnabled() && !isBuiltInHidden('ai') && (
        <Layout.SideButton
          label="Root AI"
          url="/cms/ai"
          active={currentUrl.startsWith('/cms/ai')}
          expanded={expanded}
        >
          <IconRobot stroke={ICON_STROKE} />
        </Layout.SideButton>
      )}

      {sidebarTools && (
        <>
          <div className="Layout__side__divider my-2 h-px bg-border" />
          {Object.entries(sidebarTools).map(([id, tool]) => {
            const cmsUrl = tool.cmsUrl?.startsWith('/cms/')
              ? tool.cmsUrl
              : undefined;
            const externalUrl = tool.externalUrl;
            const href = externalUrl ?? cmsUrl ?? `/cms/tools/${id}`;
            const normalizedHref = externalUrl
              ? undefined
              : href.replace(/\/*$/g, '');
            const active =
              !externalUrl &&
              !!normalizedHref &&
              (currentUrl === normalizedHref ||
                currentUrl.startsWith(`${normalizedHref}/`));
            return (
              <Layout.SideButton
                key={id}
                className="Layout__side__tool"
                label={tool.label || ''}
                url={href}
                active={active}
                external={Boolean(externalUrl)}
                expanded={expanded}
              >
                {tool.icon ? (
                  <img
                    className="Layout__side__tool__icon"
                    src={tool.icon}
                    alt=""
                  />
                ) : (
                  <IconCarrot stroke={ICON_STROKE} />
                )}
              </Layout.SideButton>
            );
          })}
          <div className="Layout__side__divider my-2 h-px bg-border" />
        </>
      )}

      {!isBuiltInHidden('settings') && (
        <Layout.SideButton
          label="Settings"
          url="/cms/settings"
          active={currentUrl.startsWith('/cms/settings')}
          expanded={expanded}
        >
          <IconSettings stroke={ICON_STROKE} />
        </Layout.SideButton>
      )}
    </>
  );
};

/** The signed-in user's avatar in the rail, with a sign-out menu. */
Layout.UserMenu = (props: {expanded: boolean}) => {
  const user = window.firebase.user;
  return (
    <div
      className={cn(
        'Layout__side__user flex w-full',
        props.expanded ? 'Layout__side__row justify-start' : 'justify-center'
      )}
    >
      <Menu
        placement="right-end"
        label="Account"
        trigger={
          <button
            type="button"
            className="Layout__side__user__button flex max-w-full appearance-none items-center gap-2.5 rounded-full border-0 bg-transparent p-0 font-sans focus-visible:ring-2 focus-visible:ring-focus"
            aria-label={props.expanded ? undefined : `Account: ${user.email}`}
          >
            <Avatar
              className="shrink-0"
              src={user.photoURL}
              alt={user.email!}
              size="xs"
            />
            {props.expanded && (
              <span className="Layout__side__user__email min-w-0 truncate text-sm text-muted">
                {user.email}
              </span>
            )}
          </button>
        }
      >
        <div className="Layout__side__user__signedInAs max-w-56 truncate px-2 py-1.5 text-xs text-muted">
          Signed in as {user.email}
        </div>
        <MenuDivider />
        <MenuItem danger icon={<IconLogout />} onClick={signOut}>
          Sign out
        </MenuItem>
      </Menu>
    </div>
  );
};

/**
 * Button that expands or collapses the left-hand sidebar. The sidebar link
 * labels are only visible when the sidebar is expanded.
 */
Layout.SideToggleButton = () => {
  const {expanded, toggle} = useSidebar();
  const label = expanded ? 'Collapse sidebar' : 'Expand sidebar';
  const button = (
    <button
      type="button"
      className={cn(
        'Layout__side__toggle__button Layout__side__row flex h-9 w-full appearance-none items-center gap-3 border-0 bg-transparent font-sans text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
        expanded ? 'justify-start' : 'justify-center'
      )}
      onClick={toggle}
      aria-label={label}
      aria-expanded={expanded}
    >
      <span className="Layout__side__toggle__icon Layout__side__icon">
        {expanded ? (
          <IconLayoutSidebarLeftCollapse stroke={ICON_STROKE} />
        ) : (
          <IconLayoutSidebarLeftExpand stroke={ICON_STROKE} />
        )}
      </span>
      {expanded && (
        <span className="Layout__side__toggle__label min-w-0 truncate text-sm font-medium">
          {label}
        </span>
      )}
    </button>
  );
  return (
    <div className="Layout__side__toggle w-full">
      {expanded ? (
        button
      ) : (
        <Tooltip label={label} placement="right">
          {button}
        </Tooltip>
      )}
    </div>
  );
};

interface SideButtonProps {
  className?: string;
  label: string;
  url: string;
  active: boolean;
  external?: boolean;
  /** Shows the label next to the icon, instead of as a tooltip. */
  expanded: boolean;
  children: ComponentChildren;
}

Layout.SideButton = (props: SideButtonProps) => {
  const expanded = props.expanded;
  const link = (
    <a
      className={cn(
        'Layout__side__button__link Layout__side__row relative flex h-full w-full items-center text-fg no-underline hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
        expanded ? 'justify-start gap-3' : 'justify-center'
      )}
      href={props.url}
      target={props.external ? '_blank' : undefined}
      rel={props.external ? 'noreferrer noopener' : undefined}
      aria-current={props.active ? 'page' : undefined}
      aria-label={expanded ? undefined : props.label}
    >
      <span className="Layout__side__button__icon Layout__side__icon">
        {props.children}
      </span>
      {expanded && (
        <span className="Layout__side__button__label min-w-0 truncate text-sm font-medium">
          {props.label}
        </span>
      )}
    </a>
  );
  return (
    <div
      className={cn(
        'Layout__side__button block h-9 w-full pointer-coarse:h-10',
        props.className
      )}
    >
      {expanded ? (
        link
      ) : (
        <Tooltip label={props.label} placement="right">
          {link}
        </Tooltip>
      )}
    </div>
  );
};

Layout.Main = (props: LayoutProps) => {
  return (
    <main className={cn('Layout__main min-w-0', props.className)}>
      {props.children}
    </main>
  );
};
