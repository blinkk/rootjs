import {useEffect, useRef, useState} from 'preact/hooks';
import {isRootToolLocationMessage} from '../../../shared/embed-protocol.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {Layout} from '../../layout/Layout.js';
import {
  IFRAME_PATH_PARAM,
  computeStoredPath,
  getRelativePath,
  getStoredIframePath,
  resolveInitialSrc,
} from '../../utils/iframe-url-sync.js';
import './SidebarToolsPage.css';

interface SidebarToolsPageProps {
  id: string;
}

/** Polling interval (ms) used to detect SPA navigations in same-origin tools. */
const POLL_INTERVAL_MS = 400;

export function SidebarToolsPage(props: SidebarToolsPageProps) {
  const sidebarTools = window.__ROOT_CTX.sidebar?.tools || {};
  const tool = sidebarTools[props.id];
  usePageTitle(tool?.label || props.id);
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
        {/*
          Key by tool id so switching tools (e.g. /cms/tools/a -> /cms/tools/b)
          remounts the iframe with the new URL instead of reusing the stale
          initial src captured on first mount.
        */}
        <ToolIframe key={props.id} iframeUrl={tool.iframeUrl} />
      </div>
    </Layout>
  );
}

interface ToolIframeProps {
  iframeUrl: string;
}

/**
 * Renders a sidebar tool inside an iframe and keeps the iframe's location in
 * sync with the CMS URL, both ways:
 *
 * - On mount, the iframe is opened at the sub-path stored on the CMS URL (the
 *   `path` query param), so refreshing or sharing the page lands the user back
 *   where they were inside the tool.
 * - As the user navigates within the tool, the CMS URL's `path` param is
 *   updated to mirror the iframe's location (path, query params, and hash).
 *
 * Same-origin tools are synced automatically by reading `contentWindow`. The
 * browser blocks reading the location of a cross-origin tool, so those tools
 * can opt in by posting a {@link RootToolLocationMessage} on navigation; until
 * they do, the initial restore on refresh still works (the iframe is simply
 * opened at the stored URL).
 */
function ToolIframe(props: ToolIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Resolve the iframe's base URL once. `iframeUrl` may be absolute or relative
  // to the CMS origin. This component is keyed by tool id, so switching tools
  // remounts it and re-runs these initializers with the new URL.
  const [base] = useState(() => new URL(props.iframeUrl, window.location.href));

  // Compute the initial src once, restoring any stored sub-path so a refresh or
  // shared link lands the user back where they were inside the tool.
  const [initialSrc] = useState(() =>
    resolveInitialSrc(
      props.iframeUrl,
      getStoredIframePath(window.location.search)
    )
  );

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }

    let lastSynced: string | null = null;
    // Set true once we detect the tool has navigated to a cross-origin page,
    // whose location the browser won't let us read. We then rely on the tool
    // posting location updates instead of polling.
    let crossOrigin = false;

    /** Mirrors the tool's relative location into the CMS URL `path` param. */
    const syncCmsUrl = (relativePath: string) => {
      if (relativePath === lastSynced) {
        return;
      }
      lastSynced = relativePath;
      const stored = computeStoredPath(props.iframeUrl, relativePath);
      const url = new URL(window.location.href);
      if (stored) {
        url.searchParams.set(IFRAME_PATH_PARAM, stored);
      } else {
        // At the tool's home location: drop the param to keep the URL clean.
        url.searchParams.delete(IFRAME_PATH_PARAM);
      }
      // Use replaceState (not pushState) so each in-tool navigation doesn't add
      // a redundant CMS history entry on top of the iframe's own history entry.
      // Preserve the existing history state so the router isn't disrupted.
      window.history.replaceState(window.history.state, '', url.toString());
    };

    /** Reads the same-origin tool's relative location, or null if unreadable. */
    const readRelativePath = (): string | null => {
      try {
        const loc = iframe.contentWindow?.location;
        if (!loc || loc.href === 'about:blank') {
          return null;
        }
        return `${loc.pathname}${loc.search}${loc.hash}`;
      } catch {
        // Cross-origin: the browser blocks reading the location.
        crossOrigin = true;
        return null;
      }
    };

    const handleLoad = () => {
      const relativePath = readRelativePath();
      if (relativePath !== null) {
        syncCmsUrl(relativePath);
      }
    };
    iframe.addEventListener('load', handleLoad);

    // SPA navigations and hash changes inside a same-origin tool don't fire the
    // iframe's load event, so poll the location to pick them up.
    let pollTimer = 0;
    const poll = () => {
      if (!crossOrigin) {
        const relativePath = readRelativePath();
        if (relativePath !== null) {
          syncCmsUrl(relativePath);
        }
      }
      if (!crossOrigin) {
        pollTimer = window.setTimeout(poll, POLL_INTERVAL_MS);
      }
    };
    pollTimer = window.setTimeout(poll, POLL_INTERVAL_MS);

    // Cross-origin tools can opt in to syncing by posting their location.
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) {
        return;
      }
      if (event.origin !== base.origin) {
        return;
      }
      if (!isRootToolLocationMessage(event.data)) {
        return;
      }
      try {
        const toolUrl = new URL(event.data.rootTool.url, base.origin);
        syncCmsUrl(getRelativePath(toolUrl));
      } catch {
        // Ignore malformed URLs.
      }
    };
    window.addEventListener('message', handleMessage);

    return () => {
      iframe.removeEventListener('load', handleLoad);
      window.clearTimeout(pollTimer);
      window.removeEventListener('message', handleMessage);
    };
  }, [base, props.iframeUrl]);

  return <iframe ref={iframeRef} src={initialSrc} />;
}
