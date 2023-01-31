import {ComponentChildren} from 'preact';
import packageJson from '../../package.json' assert {type: 'json'};
import './Layout.css';

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
  return <div className="Layout__side"></div>;
};

Layout.Main = (props: LayoutProps) => {
  return <div className="Layout__main">{props.children}</div>;
};

Layout.Bottom = (props: LayoutProps) => {
  return <div className="Layout__bottom"></div>;
};
