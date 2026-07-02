import {useEffect, useRef, useState} from 'preact/hooks';
import {isRootToolLocationMessage} from '../../../shared/embed-protocol.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {Layout} from '../../layout/Layout.js';
import {
  cmsUrlToIframeSrc,
  iframeLocationToCmsUrl,
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
        <ToolIframe key={props.id} id={props.id} iframeUrl={tool.iframeUrl} />
      </div>
    </Layout>
  );
}

interface ToolIframeProps {
  id: string;
  iframeUrl: string;
}

/**
 * Renders a sidebar tool inside an iframe and keeps the iframe's location in
 * sync with the CMS URL, both ways:
 *
 * - On mount, the iframe is opened at the sub-path taken from the CMS URL
 *   (`/cms/tools/:id/<sub-path>`), so refreshing or sharing the page lands the
 *   user back where they were inside the tool.
 * - As the user navigates within the tool, the CMS URL is updated to mirror
 *   the iframe's location: the sub-path relative to the tool's base, plus its
 *   query params and hash. A tool at `/cms/tools/foo` iframed to `/myroute/foo`
 *   that navigates to `/myroute/foo/bar/` shows `/cms/tools/foo/bar/`.
 *
 * Same-origin tools are synced automatically by reading `contentWindow`. The
 * browser blocks reading the location of a cross-origin tool, so those tools
 * can opt in by posting a {@link RootToolLocationMessage} on navigation; until
 * they do, the initial restore on refresh still works (the iframe is simply
 * opened at the mirrored URL).
 */
function ToolIframe(props: ToolIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Resolve the iframe's base URL once. `iframeUrl` may be absolute or relative
  // to the CMS origin. This component is keyed by tool id, so switching tools
  // remounts it and re-runs these initializers with the new URL.
  const [base] = useState(() => new URL(props.iframeUrl, window.location.href));

  // Compute the initial src once, restoring the sub-path from the CMS URL so a
  // refresh or shared link lands the user back where they were inside the tool.
  const [initialSrc] = useState(() =>
    cmsUrlToIframeSrc(props.iframeUrl, props.id, window.location)
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

    /** Mirrors the tool's location into the CMS URL. */
    const syncCmsUrl = (loc: {
      pathname: string;
      search: string;
      hash: string;
    }) => {
      const cmsUrl = iframeLocationToCmsUrl(props.iframeUrl, props.id, loc);
      // A null result means the tool navigated outside its base path and can't
      // be represented under /cms/tools/:id; leave the CMS URL untouched.
      if (cmsUrl === null || cmsUrl === lastSynced) {
        return;
      }
      lastSynced = cmsUrl;
      // Use replaceState (not pushState) so each in-tool navigation doesn't add
      // a redundant CMS history entry on top of the iframe's own history entry.
      // Preserve the existing history state so the router isn't disrupted.
      window.history.replaceState(window.history.state, '', cmsUrl);
    };

    /** Reads the same-origin tool's location, or null if unreadable. */
    const readIframeLocation = () => {
      try {
        const loc = iframe.contentWindow?.location;
        if (!loc || loc.href === 'about:blank') {
          return null;
        }
        return {pathname: loc.pathname, search: loc.search, hash: loc.hash};
      } catch {
        // Cross-origin: the browser blocks reading the location.
        crossOrigin = true;
        return null;
      }
    };

    const handleLoad = () => {
      const loc = readIframeLocation();
      if (loc) {
        syncCmsUrl(loc);
      }
    };
    iframe.addEventListener('load', handleLoad);

    // SPA navigations and hash changes inside a same-origin tool don't fire the
    // iframe's load event, so poll the location to pick them up.
    let pollTimer = 0;
    const poll = () => {
      if (!crossOrigin) {
        const loc = readIframeLocation();
        if (loc) {
          syncCmsUrl(loc);
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
        syncCmsUrl({
          pathname: toolUrl.pathname,
          search: toolUrl.search,
          hash: toolUrl.hash,
        });
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
  }, [base, props.id, props.iframeUrl]);

  return <iframe ref={iframeRef} src={initialSrc} />;
}
