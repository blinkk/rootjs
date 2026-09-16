/**
 * Wire protocol for the postMessage channels between the Root CMS UI and
 * pages that embed it (or are embedded by it). This file IS the wire
 * protocol: any change here must remain compatible with already-deployed CMS
 * servers and published versions of `@blinkk/root-cms/browser-client`.
 *
 * Channels:
 * - Embedded ("headless") pages -> parent window: lifecycle messages,
 *   namespaced under `root` ({@link RootEmbedMessage}).
 * - Parent window -> doc editor: field focus requests
 *   ({@link ScrollToDeeplinkMessage}).
 * - In-CMS preview iframe -> doc editor: requests to edit another doc
 *   ({@link NavigateToDocMessage}).
 * - Doc editor -> in-CMS preview iframe: field highlight requests
 *   ({@link HighlightNodeMessage}).
 *
 * The `scrollToDeeplink` / `highlightNode` messages predate the `root`
 * namespace and are intentionally left un-namespaced for compatibility.
 */

/** Save state of the draft doc. */
export enum SaveState {
  NO_CHANGES = 'NO_CHANGES',
  UPDATES_PENDING = 'UPDATE_PENDING',
  SAVING = 'SAVING',
  SAVED = 'SAVED',
  ERROR = 'ERROR',
}

/**
 * Lifecycle messages posted from the headless (embedded) pages (the doc
 * editor and the Root AI panel) to the parent window that frames them. All
 * messages are namespaced under `root` to avoid colliding with the
 * un-namespaced `{scrollToDeeplink}` / `{highlightNode}` messages used by the
 * in-CMS preview channel.
 */
export interface RootEmbedMessage {
  root: {
    /** The lifecycle event type. */
    type: 'ready' | 'saved' | 'published' | 'error';
    /** The doc being edited, e.g. "Pages/about" (when applicable). */
    docId?: string;
    /** Current save state (included on `saved`). */
    saveState?: SaveState;
    /** Epoch millis the doc was published (included on `published`). */
    publishedAt?: number;
    /** Error message (included on `error`). */
    error?: string;
  };
}

/**
 * Posted from an iframed sidebar tool to the parent CMS window to report the
 * tool's current location. The CMS mirrors this into its own address bar so
 * the tool's sub-path, query params, and hash survive a refresh and can be
 * deep-linked/shared.
 *
 * Same-origin tools are synced automatically (the CMS reads
 * `contentWindow.location` directly), so this message only needs to be posted
 * by cross-origin tools, which the browser prevents the CMS from reading.
 */
export interface RootToolLocationMessage {
  rootTool: {
    type: 'locationchange';
    /** The tool's current URL, absolute or relative to the tool's origin. */
    url: string;
  };
}

/** Requests that the doc editor scroll to (focus) a specific field. */
export interface ScrollToDeeplinkMessage {
  scrollToDeeplink: {
    /** The deep key of the field to scroll to, e.g. "hero.title". */
    deepKey: string;
  };
}

/**
 * Requests that the doc editor switch to another document.
 *
 * Posted by a page rendered inside the CMS preview pane to say which doc it is
 * showing, so the editor can follow the preview as the user navigates the site.
 * The page knows its own doc id, which is why the CMS doesn't try to derive one
 * from the url.
 *
 * The doc id is untrusted input: the CMS checks the collection exists and the
 * slug is well-formed before routing anywhere.
 */
export interface NavigateToDocMessage {
  navigateToDoc: {
    /** The doc to edit, e.g. "Pages/about". */
    docId: string;
    /**
     * Whether to ask the user before switching docs. Defaults to `true`: the
     * editor would otherwise jump to another doc unannounced, which is
     * disorienting for an editor who doesn't know the page can do that. Set it
     * to `false` only when the site has its own affordance, e.g. a toggle the
     * user turned on.
     */
    confirm?: boolean;
  };
}

/**
 * Requests that the preview page highlight the node associated with a field.
 * A `null` deepKey clears all highlights.
 */
export interface HighlightNodeMessage {
  highlightNode: {
    deepKey: string | null;
    options?: {
      /** Whether to scroll to the node in the preview. */
      scroll: boolean;
    };
  };
}

const EMBED_MESSAGE_TYPES = ['ready', 'saved', 'published', 'error'];

/** Returns whether a postMessage payload is a {@link RootEmbedMessage}. */
export function isRootEmbedMessage(data: unknown): data is RootEmbedMessage {
  const root = (data as RootEmbedMessage)?.root;
  return (
    typeof root === 'object' &&
    root !== null &&
    EMBED_MESSAGE_TYPES.includes(root.type)
  );
}

/** Returns whether a postMessage payload is a {@link RootToolLocationMessage}. */
export function isRootToolLocationMessage(
  data: unknown
): data is RootToolLocationMessage {
  const req = (data as RootToolLocationMessage)?.rootTool;
  return (
    typeof req === 'object' &&
    req !== null &&
    req.type === 'locationchange' &&
    typeof req.url === 'string'
  );
}

/** Returns whether a postMessage payload is a {@link ScrollToDeeplinkMessage}. */
export function isScrollToDeeplinkMessage(
  data: unknown
): data is ScrollToDeeplinkMessage {
  const req = (data as ScrollToDeeplinkMessage)?.scrollToDeeplink;
  return (
    typeof req === 'object' && req !== null && typeof req.deepKey === 'string'
  );
}

/** Returns whether a postMessage payload is a {@link NavigateToDocMessage}. */
export function isNavigateToDocMessage(
  data: unknown
): data is NavigateToDocMessage {
  const req = (data as NavigateToDocMessage)?.navigateToDoc;
  return (
    typeof req === 'object' &&
    req !== null &&
    typeof req.docId === 'string' &&
    (req.confirm === undefined || typeof req.confirm === 'boolean')
  );
}

/** Returns whether a postMessage payload is a {@link HighlightNodeMessage}. */
export function isHighlightNodeMessage(
  data: unknown
): data is HighlightNodeMessage {
  const req = (data as HighlightNodeMessage)?.highlightNode;
  return (
    typeof req === 'object' &&
    req !== null &&
    (typeof req.deepKey === 'string' || req.deepKey === null)
  );
}
