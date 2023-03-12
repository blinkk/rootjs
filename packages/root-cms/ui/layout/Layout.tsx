import {ComponentChildren} from 'preact';
import {Tooltip} from '@mantine/core';
import {
  IconDatabase,
  IconFolder,
  IconHome,
  IconLanguage,
  IconPhoto,
  IconSettings,
  IconSitemap,
} from '@tabler/icons-preact';
import packageJson from '../../package.json' assert {type: 'json'};
import './Layout.css';
import {useRouter} from 'preact-router';
import {joinClassNames} from '../utils/classes.js';

const ICON_STROKE = '1.5';

interface LayoutProps {
  className?: string;
  children?: ComponentChildren;
}

export function Layout(props: LayoutProps) {
  return (
    <div className="Layout">
      <Layout.Top {...props} />
      <Layout.Side {...props} />
      <Layout.Main {...props}>{props.children}</Layout.Main>
      <Layout.Bottom {...props} />
    </div>
  );
}

Layout.Top = (props: LayoutProps) => {
  return (
    <div className="Layout__top">
      <a className="Layout__top__logo" href="/cms">
        <IconSitemap size={14} />
        <div>Root.js</div>
      </a>
      <div className="Layout__top__version">v{packageJson.version}</div>
    </div>
  );
};

Layout.Side = (props: LayoutProps) => {
  const [route] = useRouter();
  const currentUrl = route.url.replace(/\/*$/g, '');
  return (
    <div className="Layout__side">
      <Layout.SideButton label="Home" url="/cms" active={currentUrl === '/cms'}>
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

      <Layout.SideButton
        label="Settings"
        url="/cms/settings"
        active={currentUrl.startsWith('/cms/settings')}
      >
        <IconSettings stroke={ICON_STROKE} />
      </Layout.SideButton>
    </div>
  );
};

interface SideButtonProps {
  label: string;
  url: string;
  active: boolean;
  children: ComponentChildren;
}

Layout.SideButton = (props: SideButtonProps) => {
  return (
    <Tooltip
      className="Layout__side__button"
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

Layout.Bottom = (props: LayoutProps) => {
  return <div className="Layout__bottom"></div>;
};
