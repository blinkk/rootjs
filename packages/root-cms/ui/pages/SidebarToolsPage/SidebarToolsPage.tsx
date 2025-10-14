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

  useEffect(() => {
    if (cmsUrl?.startsWith('/cms/')) {
      window.location.replace(cmsUrl);
    }
  }, [cmsUrl]);

  if (!tool) {
    return (
      <Layout>
        <div className="SidebarToolsPage SidebarToolsPage--error">
          not found: {props.id}
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
