import {
  Avatar,
  Divider,
  Menu,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
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
  IconPhoto,
  IconRobot,
  IconRocket,
  IconSettings,
} from '@tabler/icons-preact';
import {ComponentChildren, createContext} from 'preact';
import {useCallback, useContext, useMemo} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import type {CMSBuiltInSidebarTool} from '../../core/plugin.js';
import packageJson from '../../package.json' assert {type: 'json'};
import {RootCMSLogo} from '../components/RootCMSLogo/RootCMSLogo.js';
import {SearchBar} from '../components/SearchBar/SearchBar.js';
import {useLocalStorage} from '../hooks/useLocalStorage.js';
import {testAiEnabled} from '../utils/ai.js';
import {joinClassNames} from '../utils/classes.js';
import './Layout.css';

const ICON_STROKE = '1.5';

const SIDEBAR_EXPANDED_STORAGE_KEY = 'root::Layout::sidebarExpanded';

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

export function Layout(props: LayoutProps) {
  const [expanded, setExpanded] = useLocalStorage<boolean>(
    SIDEBAR_EXPANDED_STORAGE_KEY,
    false
  );
  const toggle = useCallback(() => {
    setExpanded((current) => !current);
  }, [setExpanded]);
  const sidebar = useMemo(() => ({expanded, toggle}), [expanded, toggle]);
  return (
    <SidebarContext.Provider value={sidebar}>
      <div
        className={joinClassNames(
          'Layout',
          expanded && 'Layout--sidebar-expanded'
        )}
      >
        <Layout.Top />
        <Layout.Side />
        <Layout.Main {...props}>{props.children}</Layout.Main>
        <Layout.Bottom />
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

Layout.Top = () => {
  const rootConfig = window.__ROOT_CTX.rootConfig;
  const projectName = rootConfig.projectName || rootConfig.projectId;
  const minimalBranding = rootConfig.minimalBranding;
  const {url} = useLocation();
  const showSearchBar = !isDocumentEditorUrl(url);
  return (
    <div className="Layout__top">
      {!minimalBranding ? (
        <>
          <a className="Layout__top__logo" href="/cms">
            <RootCMSLogo />
          </a>
          <Layout.Version />
          <div className="Layout__top__project">{projectName}</div>
        </>
      ) : (
        <>
          <a className="Layout__top__logo" href="/cms">
            {projectName}
          </a>
          <Layout.Version />
        </>
      )}
      {showSearchBar && (
        <div className="Layout__top__search">
          <SearchBar />
        </div>
      )}
    </div>
  );
};

/**
 * The Root CMS version badge in the top bar, which links to the changelog.
 * When the app is prebuilt (i.e. deployed, not the dev server), a tooltip
 * shows when the server was built.
 */
Layout.Version = () => {
  const buildTimestamp = window.__ROOT_CTX.build?.timestamp;
  const version = (
    <a
      className="Layout__top__version"
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
      className="Layout__top__version__tooltip"
      label={`Built ${formatBuildTime(buildTimestamp)}`}
      position="bottom"
      withArrow
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

Layout.Side = () => {
  const {url} = useLocation();
  const currentUrl = url.replace(/\/*$/g, '');
  const user = window.firebase.user;
  const {expanded} = useSidebar();
  const sidebarTools = window.__ROOT_CTX.sidebar?.tools;
  const hiddenBuiltInTools = new Set<CMSBuiltInSidebarTool>(
    window.__ROOT_CTX.sidebar?.hiddenBuiltInTools || []
  );
  const isBuiltInHidden = (tool: CMSBuiltInSidebarTool) =>
    hiddenBuiltInTools.has(tool);
  const experiments = window.__ROOT_CTX.experiments || {};

  const onSignOut = async () => {
    await window.firebase.auth.signOut();
    window.location.href = '/cms/login';
  };

  return (
    <div className="Layout__side">
      <div className="Layout__side__buttons">
        {!isBuiltInHidden('home') && (
          <Layout.SideButton
            label="Home"
            url="/cms"
            active={currentUrl === '/cms'}
          >
            <IconHome stroke={ICON_STROKE} />
          </Layout.SideButton>
        )}

        {!isBuiltInHidden('content') && (
          <Layout.SideButton
            label="Content"
            url="/cms/content"
            active={currentUrl.startsWith('/cms/content')}
          >
            <IconFolder stroke={ICON_STROKE} />
          </Layout.SideButton>
        )}

        {experiments.taskManager && (
          <Layout.SideButton
            label="Tasks"
            url="/cms/tasks"
            active={currentUrl.startsWith('/cms/tasks')}
          >
            <IconClipboardList stroke={ICON_STROKE} />
          </Layout.SideButton>
        )}

        {!isBuiltInHidden('releases') && (
          <Layout.SideButton
            label="Releases"
            url="/cms/releases"
            active={currentUrl.startsWith('/cms/releases')}
          >
            <IconRocket stroke={ICON_STROKE} />
          </Layout.SideButton>
        )}

        {!isBuiltInHidden('data') && (
          <Layout.SideButton
            label="Data"
            url="/cms/data"
            active={currentUrl.startsWith('/cms/data')}
          >
            <IconDatabase stroke={ICON_STROKE} />
          </Layout.SideButton>
        )}

        {!isBuiltInHidden('assets') && (
          <Layout.SideButton
            label="Asset Library"
            url="/cms/assets"
            active={currentUrl.startsWith('/cms/assets')}
          >
            <IconPhoto stroke={ICON_STROKE} />
          </Layout.SideButton>
        )}

        {!isBuiltInHidden('translations') && (
          <Layout.SideButton
            label="Translations"
            url="/cms/translations"
            active={currentUrl.startsWith('/cms/translations')}
          >
            <IconLanguage stroke={ICON_STROKE} />
          </Layout.SideButton>
        )}

        {testAiEnabled() && !isBuiltInHidden('ai') && (
          <Layout.SideButton
            label="Root AI"
            url="/cms/ai"
            active={currentUrl.startsWith('/cms/ai')}
          >
            <IconRobot stroke={ICON_STROKE} />
          </Layout.SideButton>
        )}

        {sidebarTools && (
          <>
            <div className="Layout__side__divider" />
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
                >
                  {tool.icon ? (
                    <img
                      className="Layout__side__tool__icon"
                      src={tool.icon}
                      alt={tool.label || ''}
                    />
                  ) : (
                    <IconCarrot stroke={ICON_STROKE} />
                  )}
                </Layout.SideButton>
              );
            })}
            <div className="Layout__side__divider" />
          </>
        )}

        {!isBuiltInHidden('settings') && (
          <Layout.SideButton
            label="Settings"
            url="/cms/settings"
            active={currentUrl.startsWith('/cms/settings')}
          >
            <IconSettings stroke={ICON_STROKE} />
          </Layout.SideButton>
        )}
      </div>
      <div className="Layout__side__footer">
        <Layout.SideToggleButton />
        <div className="Layout__side__user">
          <Menu
            shadow="md"
            position="right"
            control={
              <UnstyledButton className="Layout__side__user__button">
                <Avatar
                  src={user.photoURL}
                  alt={user.email!}
                  size={22}
                  radius="xl"
                />
                {expanded && (
                  <div className="Layout__side__user__email">{user.email}</div>
                )}
              </UnstyledButton>
            }
          >
            <Menu.Label>
              <Text size="xs" color="dimmed" truncate>
                Signed in as {user.email}
              </Text>
            </Menu.Label>
            <Divider />
            <Menu.Item
              color="red"
              icon={<IconLogout style={{width: 14, height: 14}} />}
              onClick={onSignOut}
            >
              Sign out
            </Menu.Item>
          </Menu>
        </div>
      </div>
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
    <UnstyledButton
      className="Layout__side__toggle__button"
      onClick={toggle}
      aria-label={label}
      aria-expanded={expanded}
    >
      <div className="Layout__side__toggle__icon">
        {expanded ? (
          <IconLayoutSidebarLeftCollapse stroke={ICON_STROKE} />
        ) : (
          <IconLayoutSidebarLeftExpand stroke={ICON_STROKE} />
        )}
      </div>
      {expanded && <div className="Layout__side__toggle__label">{label}</div>}
    </UnstyledButton>
  );
  if (expanded) {
    return <div className="Layout__side__toggle">{button}</div>;
  }
  return (
    <Tooltip
      className="Layout__side__toggle"
      label={label}
      position="right"
      withArrow
    >
      {button}
    </Tooltip>
  );
};

interface SideButtonProps {
  className?: string;
  label: string;
  url: string;
  active: boolean;
  external?: boolean;
  children: ComponentChildren;
}

Layout.SideButton = (props: SideButtonProps) => {
  const {expanded} = useSidebar();
  const link = (
    <a
      className={joinClassNames(props.active && 'active')}
      href={props.url}
      target={props.external ? '_blank' : undefined}
      rel={props.external ? 'noreferrer noopener' : undefined}
    >
      <div className="Layout__side__button__icon">{props.children}</div>
      {expanded && (
        <div className="Layout__side__button__label">{props.label}</div>
      )}
    </a>
  );
  // The label is already visible when the sidebar is expanded, so the tooltip
  // is only used in the collapsed state.
  if (expanded) {
    return (
      <div className={joinClassNames('Layout__side__button', props.className)}>
        {link}
      </div>
    );
  }
  return (
    <Tooltip
      className={joinClassNames('Layout__side__button', props.className)}
      label={props.label}
      position="right"
      withArrow
    >
      {link}
    </Tooltip>
  );
};

Layout.Main = (props: LayoutProps) => {
  return <div className="Layout__main">{props.children}</div>;
};

Layout.Bottom = () => {
  return <div className="Layout__bottom"></div>;
};
