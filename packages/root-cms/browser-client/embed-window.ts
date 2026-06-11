import {
  isRootEmbedMessage,
  RootEmbedMessage,
  SaveState,
} from '../shared/embed-protocol.js';
import {Emitter} from './emitter.js';

/** Events emitted by an embedded CMS window (iframe or pop-up). */
export interface EmbedWindowEvents {
  /** The embedded page finished loading. */
  ready: {docId?: string};
  /** The doc was saved. */
  saved: {docId?: string; saveState?: SaveState};
  /** The doc was published. */
  published: {docId?: string; publishedAt?: number};
  /** An error occurred (e.g. the pop-up was blocked). */
  error: {error?: string};
  /** The embedded window was closed (via `close()` or by the user). */
  close: void;
}

export interface EmbedWindowOptions {
  /** How to open the embedded page. Defaults to `popup`. */
  mode?: 'popup' | 'iframe';
  /** Container the iframe is appended to. Required when mode is `iframe`. */
  container?: HTMLElement;
  /** Pop-up window width. Defaults to 480. */
  width?: number;
  /** Pop-up window height. Defaults to 720. */
  height?: number;
}

const POPUP_POLL_INTERVAL = 500;
const DEFAULT_POPUP_WIDTH = 480;
const DEFAULT_POPUP_HEIGHT = 720;

/**
 * Internal plumbing shared by the embedded doc editor and Root AI handles.
 * Owns the iframe-or-popup lifecycle: opening, message routing (with origin
 * and source validation), outbound message buffering until `ready`, reload,
 * and close detection.
 */
export class EmbedWindow {
  /** The iframe element (iframe mode only). */
  readonly element: HTMLIFrameElement | null = null;
  /** The pop-up window (popup mode only). */
  readonly window: Window | null = null;

  private url: string;
  private cmsOrigin: string;
  private emitter = new Emitter<EmbedWindowEvents>();
  private ready = false;
  private closed = false;
  private outbox: unknown[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(url: string, cmsOrigin: string, options?: EmbedWindowOptions) {
    this.url = url;
    this.cmsOrigin = cmsOrigin;
    window.addEventListener('message', this.onMessage);
    const mode = options?.mode || 'popup';
    if (mode === 'iframe') {
      if (!options?.container) {
        throw new Error('`container` is required when mode is "iframe"');
      }
      const iframe = document.createElement('iframe');
      iframe.className = 'root-cms-embed';
      iframe.src = url;
      options.container.appendChild(iframe);
      this.element = iframe;
    } else {
      const width = options?.width ?? DEFAULT_POPUP_WIDTH;
      const height = options?.height ?? DEFAULT_POPUP_HEIGHT;
      const popup = window.open(
        url,
        '_blank',
        `popup,width=${width},height=${height}`
      );
      if (!popup) {
        // Pop-up blocked. Emit asynchronously so callers have a chance to
        // attach listeners to the handle first.
        queueMicrotask(() => {
          this.emitter.emit('error', {
            error:
              'popup blocked (open the editor from a user gesture, e.g. a click handler)',
          });
          this.close();
        });
      } else {
        this.window = popup;
        this.pollTimer = setInterval(() => {
          if (popup.closed) {
            this.close();
          }
        }, POPUP_POLL_INTERVAL);
      }
    }
  }

  on<K extends keyof EmbedWindowEvents>(
    type: K,
    cb: (payload: EmbedWindowEvents[K]) => void
  ): () => void {
    return this.emitter.on(type, cb);
  }

  /**
   * Posts a message to the embedded window, targeted at the CMS origin.
   * Messages are buffered until the embedded page signals `ready`.
   */
  post(message: unknown) {
    if (this.closed) {
      return;
    }
    if (!this.ready) {
      this.outbox.push(message);
      return;
    }
    this.contentWindow()?.postMessage(message, this.cmsOrigin);
  }

  /** Reloads the embedded page. */
  reload() {
    if (this.closed) {
      return;
    }
    // The embedded page is cross-origin, so reload by re-navigating to the
    // url (navigation is permitted cross-origin; `location.reload()` is not).
    this.ready = false;
    if (this.element) {
      this.element.src = this.url;
    } else if (this.window) {
      this.window.location.href = this.url;
    }
  }

  /** Closes the embedded window. Safe to call multiple times. */
  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    window.removeEventListener('message', this.onMessage);
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.element?.remove();
    if (this.window && !this.window.closed) {
      this.window.close();
    }
    this.emitter.emit('close', undefined);
    this.emitter.removeAll();
  }

  private contentWindow(): Window | null {
    return this.element ? this.element.contentWindow : this.window;
  }

  private onMessage = (event: MessageEvent) => {
    // Only accept messages from the CMS origin AND from this handle's own
    // window (multiple embeds on one page each get their own listener).
    if (event.origin !== this.cmsOrigin) {
      return;
    }
    if (!event.source || event.source !== this.contentWindow()) {
      return;
    }
    if (!isRootEmbedMessage(event.data)) {
      return;
    }
    const root = (event.data as RootEmbedMessage).root;
    if (root.type === 'ready') {
      this.ready = true;
      const outbox = this.outbox;
      this.outbox = [];
      outbox.forEach((message) => this.post(message));
    }
    this.emitter.emit(root.type, root);
  };
}
