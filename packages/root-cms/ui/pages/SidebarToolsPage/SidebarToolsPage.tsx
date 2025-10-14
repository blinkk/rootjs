import {useEffect} from 'preact/hooks';
import {Layout} from '../../layout/Layout.js';
import './SidebarToolsPage.css';

interface SidebarToolsPageProps {
  id: string;
}

export function SidebarToolsPage(props: SidebarToolsPageProps) {
  const sidebarTools = window.__ROOT_CTX.sidebar?.tools || {};
  const tool = sidebarTools[props.id];
  const cmsUrl = tool?.cmsUrl;
  const externalUrl = tool?.externalUrl;

  useEffect(() => {
    if (cmsUrl?.startsWith('/cms/')) {
      window.location.replace(cmsUrl);
    }
  }, [cmsUrl]);

  useEffect(() => {
    if (externalUrl) {
      const tab = window.open(externalUrl, '_blank', 'noopener,noreferrer');
      tab?.focus();
    }
  }, [externalUrl]);

  if (!tool) {
    return (
      <Layout>
        <div className="SidebarToolsPage SidebarToolsPage--error">
          not found: {props.id}
        </div>
      </Layout>
    );
  }
  if (externalUrl) {
    return (
      <Layout>
        <div className="SidebarToolsPage SidebarToolsPage--message">
          <a href={externalUrl} target="_blank" rel="noreferrer noopener">
            Open {tool.label || props.id} in a new tab
          </a>
        </div>
      </Layout>
    );
  }
  if (cmsUrl?.startsWith('/cms/')) {
    return (
      <Layout>
        <div className="SidebarToolsPage">redirecting...</div>
      </Layout>
    );
  }
  if (cmsUrl) {
    return (
      <Layout>
        <div className="SidebarToolsPage SidebarToolsPage--error">
          invalid cmsUrl (must start with /cms/): {props.id}
        </div>
      </Layout>
    );
  }
  if (!tool.iframeUrl) {
    return (
      <Layout>
        <div className="SidebarToolsPage SidebarToolsPage--error">
          missing iframeUrl: {props.id}
        </div>
      </Layout>
    );
  }
  return (
    <Layout>
      <div className="SidebarToolsPage">
        <iframe src={tool.iframeUrl} />
      </div>
    </Layout>
  );
}
