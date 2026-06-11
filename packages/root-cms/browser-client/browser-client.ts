/**
 * Browser client for embedding Root CMS into another site, exported as
 * `@blinkk/root-cms/browser-client`. Framework-agnostic and dependency-free.
 *
 * Covers three scenarios:
 * - Opening the headless doc editor in a pop-up or iframe
 *   ({@link RootCMSBrowserClient.openEditor}).
 * - Opening the headless Root AI chat in a pop-up or iframe
 *   ({@link RootCMSBrowserClient.openAI}).
 * - Communicating with the doc editor from a site rendered inside the in-CMS
 *   preview pane ({@link RootCMSBrowserClient.connectPreview}).
 *
 * The first two require the embedding page's origin to be listed in the
 * `allowedIframeOrigins` option of the CMS plugin config.
 */

import {
  isHighlightNodeMessage,
  ScrollToDeeplinkMessage,
} from '../shared/embed-protocol.js';
import {normalizeSlug} from '../shared/slug.js';
import {EmbedWindow, EmbedWindowEvents} from './embed-window.js';
import {Emitter} from './emitter.js';

export {SaveState} from '../shared/embed-protocol.js';
export type {
  HighlightNodeMessage,
  RootEmbedMessage,
  ScrollToDeeplinkMessage,
} from '../shared/embed-protocol.js';
export type {EmbedWindowEvents} from './embed-window.js';

export interface RootCMSBrowserClientOptions {
  /** Origin of the Root CMS server, e.g. `https://cms.example.com`. */
  cmsOrigin: string;
}

export interface OpenEditorOptions {
  /** How to open the editor. Defaults to `popup`. */
  mode?: 'popup' | 'iframe';
  /** Container the iframe is appended to. Required when mode is `iframe`. */
  container?: HTMLElement;
  /** Deep key of a field to scroll to on load, e.g. `hero.title`. */
  deeplink?: string;
  /** Pop-up window width. Defaults to 480. */
  width?: number;
  /** Pop-up window height. Defaults to 720. */
  height?: number;
}

export interface OpenAIOptions extends Omit<OpenEditorOptions, 'deeplink'> {
  /** Doc to provide as context to the AI chat, e.g. `Pages/about`. */
  docId?: string;
}

/** Events emitted by {@link EmbeddedEditor}. */
export type EditorEvents = EmbedWindowEvents;

/** Events emitted by {@link EmbeddedAI}. */
export type AIEvents = Pick<EmbedWindowEvents, 'ready' | 'error' | 'close'>;

/** Event emitted when the doc editor requests a field highlight. */
export interface PreviewHighlightEvent {
  /** Deep key of the field to highlight, or `null` to clear highlights. */
  deepKey: string | null;
  /** Whether to scroll the highlighted node into view. */
  scroll: boolean;
}

/**
 * Handle to a headless doc editor opened via {@link RootCMSBrowserClient.openEditor}.
 *
 * Note: the embedded editor does not autosave; closing it discards any
 * unsaved changes.
 */
export class EmbeddedEditor {
  /** The doc being edited, e.g. `Pages/about`. */
  readonly docId: string;
  private embedWindow: EmbedWindow;

  constructor(docId: string, embedWindow: EmbedWindow) {
    this.docId = docId;
    this.embedWindow = embedWindow;
  }

  /** The iframe element (iframe mode only). */
  get element(): HTMLIFrameElement | null {
    return this.embedWindow.element;
  }

  /** The pop-up window (popup mode only). */
  get window(): Window | null {
    return this.embedWindow.window;
  }

  /** Subscribes to an editor event. Returns an unsubscribe function. */
  on<K extends keyof EditorEvents>(
    type: K,
    cb: (payload: EditorEvents[K]) => void
  ): () => void {
    return this.embedWindow.on(type, cb);
  }

  /** Scrolls the editor to (focuses) a field, e.g. `hero.title`. */
  focusField(deepKey: string) {
    const message: ScrollToDeeplinkMessage = {scrollToDeeplink: {deepKey}};
    this.embedWindow.post(message);
  }

  /** Reloads the embedded editor. */
  reload() {
    this.embedWindow.reload();
  }

  /** Closes the embedded editor, discarding any unsaved changes. */
  close() {
    this.embedWindow.close();
  }

  /** Closes the embedded editor and reloads the host page. */
  closeAndReload() {
    this.close();
    window.location.reload();
  }
}

/** Handle to a headless Root AI chat opened via {@link RootCMSBrowserClient.openAI}. */
export class EmbeddedAI {
  private embedWindow: EmbedWindow;

  constructor(embedWindow: EmbedWindow) {
    this.embedWindow = embedWindow;
  }

  /** The iframe element (iframe mode only). */
  get element(): HTMLIFrameElement | null {
    return this.embedWindow.element;
  }

  /** The pop-up window (popup mode only). */
  get window(): Window | null {
    return this.embedWindow.window;
  }

  /** Subscribes to an event. Returns an unsubscribe function. */
  on<K extends keyof AIEvents>(
    type: K,
    cb: (payload: AIEvents[K]) => void
  ): () => void {
    return this.embedWindow.on(type, cb);
  }

  /** Reloads the embedded chat (starts a fresh chat). */
  reload() {
    this.embedWindow.reload();
  }

  /** Closes the embedded chat. */
  close() {
    this.embedWindow.close();
  }

  /** Closes the embedded chat and reloads the host page. */
  closeAndReload() {
    this.close();
    window.location.reload();
  }
}

/**
 * Channel between a site rendered inside the in-CMS preview pane and the doc
 * editor that frames it. The preview iframe is same-origin with the CMS, so
 * no configuration is needed. Safe to construct unconditionally: outside the
 * preview pane the connection is inert (`isEmbedded` is false).
 */
export class PreviewConnection {
  /** Whether this page is rendered inside the in-CMS preview pane. */
  readonly isEmbedded: boolean;
  private emitter = new Emitter<{highlight: PreviewHighlightEvent}>();

  constructor() {
    this.isEmbedded = RootCMSBrowserClient.isInPreviewIframe();
    window.addEventListener('message', this.onMessage);
  }

  /**
   * Requests that the doc editor scroll to (focus) a field, e.g.
   * `hero.title`. Used to implement "click to edit".
   */
  focusField(deepKey: string) {
    if (window.parent === window) {
      return;
    }
    const message: ScrollToDeeplinkMessage = {scrollToDeeplink: {deepKey}};
    window.parent.postMessage(message, window.location.origin);
  }

  /**
   * Subscribes to field highlight requests from the doc editor (sent when the
   * user hovers/focuses a field). Returns an unsubscribe function.
   */
  on(
    type: 'highlight',
    cb: (event: PreviewHighlightEvent) => void
  ): () => void {
    return this.emitter.on(type, cb);
  }

  /** Removes the message listener and all subscriptions. */
  disconnect() {
    window.removeEventListener('message', this.onMessage);
    this.emitter.removeAll();
  }

  private onMessage = (event: MessageEvent) => {
    // The editor is same-origin with the preview iframe.
    if (event.origin !== window.location.origin) {
      return;
    }
    if (!isHighlightNodeMessage(event.data)) {
      return;
    }
    const req = event.data.highlightNode;
    this.emitter.emit('highlight', {
      deepKey: req.deepKey,
      scroll: req.options?.scroll ?? false,
    });
  };
}

/** Client for embedding Root CMS into another site. */
export class RootCMSBrowserClient {
  /** Normalized origin of the Root CMS server. */
  readonly cmsOrigin: string;

  constructor(options: RootCMSBrowserClientOptions) {
    try {
      this.cmsOrigin = new URL(options.cmsOrigin).origin;
    } catch {
      throw new Error(
        `invalid cmsOrigin: "${options?.cmsOrigin}" (expected e.g. "https://cms.example.com")`
      );
    }
  }

  /**
   * Opens the headless doc editor for a doc (e.g. `Pages/about`) in a pop-up
   * or iframe. In popup mode, call from a user gesture (e.g. a click handler)
   * to avoid pop-up blockers.
   *
   * The slug portion of the docId is normalized the same way the CMS
   * normalizes slugs, so a URL-like path also works, e.g. `Pages/about/foo`
   * -> `Pages/about--foo`.
   */
  openEditor(docId: string, options?: OpenEditorOptions): EmbeddedEditor {
    const [collection, ...slugParts] = docId.split('/');
    const slug = normalizeSlug(slugParts.join('/'));
    if (!collection || !slug) {
      throw new Error(
        `invalid docId: "${docId}" (expected "<collection>/<slug>")`
      );
    }
    const normalizedDocId = `${collection}/${slug}`;
    const url = new URL(
      `${this.cmsOrigin}/cms/embed/content/${collection}/${slug}`
    );
    if (options?.deeplink) {
      url.searchParams.set('deeplink', options.deeplink);
    }
    const embedWindow = new EmbedWindow(
      url.toString(),
      this.cmsOrigin,
      options
    );
    return new EmbeddedEditor(normalizedDocId, embedWindow);
  }

  /**
   * Opens the headless Root AI chat in a pop-up or iframe, optionally with a
   * doc as context. In popup mode, call from a user gesture (e.g. a click
   * handler) to avoid pop-up blockers.
   */
  openAI(options?: OpenAIOptions): EmbeddedAI {
    const url = new URL(`${this.cmsOrigin}/cms/embed/ai`);
    if (options?.docId) {
      url.searchParams.set('docId', options.docId);
    }
    const embedWindow = new EmbedWindow(
      url.toString(),
      this.cmsOrigin,
      options
    );
    return new EmbeddedAI(embedWindow);
  }

  /**
   * Connects to the doc editor from a site rendered inside the in-CMS preview
   * pane, enabling "click to edit" ({@link PreviewConnection.focusField}) and
   * field highlighting (`on('highlight', ...)`).
   */
  static connectPreview(): PreviewConnection {
    return new PreviewConnection();
  }

  /** Returns whether this page is rendered inside the in-CMS preview pane. */
  static isInPreviewIframe(): boolean {
    if (window.parent === window) {
      return false;
    }
    return document.referrer.startsWith(`${window.location.origin}/cms`);
  }
}
