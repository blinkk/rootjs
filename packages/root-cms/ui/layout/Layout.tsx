import {ComponentChildren} from 'preact';
import {Tooltip} from '@mantine/core';
import {IconDatabase, IconFolder, IconHome, IconLanguage, IconPhoto} from '@tabler/icons-preact';
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
        Root.js
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
      <Tooltip label="Home" position="right" withArrow>
        <a
          className={joinClassNames(
            'Layout__side__button',
            currentUrl === '/cms' && 'active'
          )}
          href="/cms"
        >
          <IconHome stroke={ICON_STROKE} />
        </a>
      </Tooltip>
      <Tooltip label="Content" position="right" withArrow>
        <a
          className={joinClassNames(
            'Layout__side__button',
            currentUrl.startsWith('/cms/content') && 'active'
          )}
          href="/cms/content"
        >
          <IconFolder stroke={ICON_STROKE} />
        </a>
      </Tooltip>
      <Tooltip label="Data" position="right" withArrow>
        <a
          className={joinClassNames(
            'Layout__side__button',
            currentUrl.startsWith('/cms/data') && 'active'
          )}
          href="/cms/data"
        >
          <IconDatabase stroke={ICON_STROKE} />
        </a>
      </Tooltip>
      <Tooltip label="Assets" position="right" withArrow>
        <a
          className={joinClassNames(
            'Layout__side__button',
            currentUrl.startsWith('/cms/assets') && 'active'
          )}
          href="/cms/assets"
        >
          <IconPhoto stroke={ICON_STROKE} />
        </a>
      </Tooltip>
      <Tooltip label="Translations" position="right" withArrow>
        <a
          className={joinClassNames(
            'Layout__side__button',
            currentUrl.startsWith('/cms/translations') && 'active'
          )}
          href="/cms/translations"
        >
          <IconLanguage stroke={ICON_STROKE} />
        </a>
      </Tooltip>
    </div>
  );
};

Layout.Main = (props: LayoutProps) => {
  return <div className="Layout__main">{props.children}</div>;
};

Layout.Bottom = (props: LayoutProps) => {
  return <div className="Layout__bottom"></div>;
};
