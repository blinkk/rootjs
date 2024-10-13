import {Avatar, Tooltip} from '@mantine/core';
import {
  IconCarrot,
  IconDatabase,
  IconFolder,
  IconHome,
  IconLanguage,
  IconPhoto,
  IconRobot,
  IconRocket,
  IconSettings,
} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {useRouter} from 'preact-router';
import {RootCMSLogo} from '@/components/RootCMSLogo/RootCMSLogo.js';
import {joinClassNames} from '@/utils/classes.js';
import packageJson from '@/../package.json' assert {type: 'json'};
import './Layout.css';

const ICON_STROKE = '1.5';

interface LayoutProps {
  className?: string;
  children?: ComponentChildren;
}

export function Layout(props: LayoutProps) {
  return (
    <div className="Layout">
      <Layout.Top />
      <Layout.Side />
      <Layout.Main {...props}>{props.children}</Layout.Main>
      <Layout.Bottom />
    </div>
  );
}

Layout.Top = () => {
  const projectName =
    window.__ROOT_CTX.rootConfig.projectName ||
    window.__ROOT_CTX.rootConfig.projectId;
  return (
    <div className="Layout__top">
      <a className="Layout__top__logo" href="/cms">
        <RootCMSLogo />
      </a>
      <div className="Layout__top__version">v{packageJson.version}</div>
      <div className="Layout__top__project">{projectName}</div>
    </div>
  );
};

Layout.Side = () => {
  const [route] = useRouter();
  const currentUrl = route.url.replace(/\/*$/g, '');
  const user = window.firebase.user;
  const sidebarTools = window.__ROOT_CTX.sidebar?.tools;
  const experiments = window.__ROOT_CTX.experiments || {};
  return (
    <div className="Layout__side">
      <div className="Layout__side__buttons">
        <Layout.SideButton
          label="Home"
          url="/cms"
          active={currentUrl === '/cms'}
        >
          <IconHome stroke={ICON_STROKE} />
        </Layout.SideButton>

        <Layout.SideButton
          label="Content"
          url="/cms/content"
          active={currentUrl.startsWith('/cms/content')}
        >
          <IconFolder stroke={ICON_STROKE} />
        </Layout.SideButton>

        <Layout.SideButton
          label="Releases"
          url="/cms/releases"
          active={currentUrl.startsWith('/cms/releases')}
        >
          <IconRocket stroke={ICON_STROKE} />
        </Layout.SideButton>

        <Layout.SideButton
          label="Data"
          url="/cms/data"
          active={currentUrl.startsWith('/cms/data')}
        >
          <IconDatabase stroke={ICON_STROKE} />
        </Layout.SideButton>

        <Layout.SideButton
          label="Assets"
          url="/cms/assets"
          active={currentUrl.startsWith('/cms/assets')}
        >
          <IconPhoto stroke={ICON_STROKE} />
        </Layout.SideButton>

        <Layout.SideButton
          label="Translations"
          url="/cms/translations"
          active={currentUrl.startsWith('/cms/translations')}
        >
          <IconLanguage stroke={ICON_STROKE} />
        </Layout.SideButton>

        {experiments.ai && (
          <Layout.SideButton
            label="Root AI (experimental)"
            url="/cms/ai"
            active={currentUrl.startsWith('/cms/ai')}
          >
            <IconRobot stroke={ICON_STROKE} />
          </Layout.SideButton>
        )}

        {sidebarTools && (
          <>
            <div className="Layout__side__divider" />
            {Object.entries(sidebarTools).map(([id, tool]) => (
              <Layout.SideButton
                className="Layout__side__tool"
                label={tool.label || ''}
                url={`/cms/tools/${id}`}
                active={currentUrl.startsWith(`/cms/tools/${id}`)}
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
            ))}
            <div className="Layout__side__divider" />
          </>
        )}

        <Layout.SideButton
          label="Settings"
          url="/cms/settings"
          active={currentUrl.startsWith('/cms/settings')}
        >
          <IconSettings stroke={ICON_STROKE} />
        </Layout.SideButton>
      </div>
      <div className="Layout__side__user">
        <Tooltip label={user.email!} position="right" withArrow>
          <Avatar src={user.photoURL} alt={user.email!} size={30} radius="xl" />
        </Tooltip>
      </div>
    </div>
  );
};

interface SideButtonProps {
  className?: string;
  label: string;
  url: string;
  active: boolean;
  children: ComponentChildren;
}

Layout.SideButton = (props: SideButtonProps) => {
  return (
    <Tooltip
      className={joinClassNames('Layout__side__button', props.className)}
      label={props.label}
      position="right"
      withArrow
    >
      <a className={joinClassNames(props.active && 'active')} href={props.url}>
        {props.children}
      </a>
    </Tooltip>
  );
};

Layout.Main = (props: LayoutProps) => {
  return <div className="Layout__main">{props.children}</div>;
};

Layout.Bottom = () => {
  return <div className="Layout__bottom"></div>;
};
