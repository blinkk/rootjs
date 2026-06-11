import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {RootCMSBrowserClient} from './browser-client.js';

const CMS_ORIGIN = 'https://cms.example.com';

function dispatchMessage(data: unknown, origin: string, source: Window | null) {
  window.dispatchEvent(new MessageEvent('message', {data, origin, source}));
}

describe('RootCMSBrowserClient', () => {
  it('normalizes cmsOrigin to an origin', () => {
    const root = new RootCMSBrowserClient({
      cmsOrigin: 'https://cms.example.com/some/path',
    });
    expect(root.cmsOrigin).toEqual('https://cms.example.com');
  });

  it('throws on an invalid cmsOrigin', () => {
    expect(() => new RootCMSBrowserClient({cmsOrigin: 'not a url'})).toThrow(
      /invalid cmsOrigin/
    );
  });

  it('throws on a non-http(s) cmsOrigin', () => {
    expect(
      () => new RootCMSBrowserClient({cmsOrigin: 'javascript:alert(1)'})
    ).toThrow(/invalid cmsOrigin/);
    expect(
      () => new RootCMSBrowserClient({cmsOrigin: 'data:text/html,hi'})
    ).toThrow(/invalid cmsOrigin/);
    expect(
      () => new RootCMSBrowserClient({cmsOrigin: 'blob:https://x.example/123'})
    ).toThrow(/invalid cmsOrigin/);
  });

  it('throws on an invalid docId', () => {
    const root = new RootCMSBrowserClient({cmsOrigin: CMS_ORIGIN});
    expect(() => root.openEditor('Pages')).toThrow(/invalid docId/);
    expect(() => root.openEditor('Pages/')).toThrow(/invalid docId/);
    expect(() => root.openEditor('/about')).toThrow(/invalid docId/);
    // Dot segments must not survive to traverse out of the embed path.
    expect(() => root.openEditor('../about')).toThrow(/invalid docId/);
    expect(() => root.openEditor('Pages/..')).toThrow(/invalid docId/);
    expect(() => root.openEditor('./about')).toThrow(/invalid docId/);
  });

  it('encodes docId segments to prevent url injection', () => {
    const root = new RootCMSBrowserClient({cmsOrigin: CMS_ORIGIN});
    const container = document.createElement('div');
    document.body.appendChild(container);
    // A `?` in the collection must not inject a query string.
    const editor = root.openEditor('Pages?evil=1/about', {
      mode: 'iframe',
      container,
    });
    const src = new URL(editor.element!.src);
    expect(src.origin).toEqual(CMS_ORIGIN);
    expect(src.pathname).toEqual('/cms/embed/content/Pages%3Fevil%3D1/about');
    expect(src.search).toEqual('');
    editor.close();
    container.remove();
  });

  it('normalizes url-like slugs in the docId', () => {
    const root = new RootCMSBrowserClient({cmsOrigin: CMS_ORIGIN});
    const container = document.createElement('div');
    document.body.appendChild(container);
    const editor = root.openEditor('Pages/about/foo', {
      mode: 'iframe',
      container,
    });
    expect(editor.docId).toEqual('Pages/about--foo');
    expect(editor.element!.src).toEqual(
      `${CMS_ORIGIN}/cms/embed/content/Pages/about--foo`
    );
    editor.close();
    container.remove();
  });
});

describe('openEditor (iframe mode)', () => {
  let root: RootCMSBrowserClient;
  let container: HTMLElement;

  beforeEach(() => {
    root = new RootCMSBrowserClient({cmsOrigin: CMS_ORIGIN});
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('requires a container', () => {
    expect(() => root.openEditor('Pages/about', {mode: 'iframe'})).toThrow(
      /container/
    );
  });

  it('creates an iframe with the embed url', () => {
    const editor = root.openEditor('Pages/about', {
      mode: 'iframe',
      container,
    });
    expect(editor.docId).toEqual('Pages/about');
    expect(editor.element).toBeInstanceOf(HTMLIFrameElement);
    expect(editor.element!.src).toEqual(
      `${CMS_ORIGIN}/cms/embed/content/Pages/about`
    );
    expect(editor.element!.parentElement).toBe(container);
    expect(editor.window).toBeNull();
    editor.close();
  });

  it('adds the deeplink query param', () => {
    const editor = root.openEditor('Pages/about', {
      mode: 'iframe',
      container,
      deeplink: 'hero.title',
    });
    expect(editor.element!.src).toEqual(
      `${CMS_ORIGIN}/cms/embed/content/Pages/about?deeplink=hero.title`
    );
    editor.close();
  });

  it('close() removes the iframe and emits close exactly once', () => {
    const editor = root.openEditor('Pages/about', {
      mode: 'iframe',
      container,
    });
    const onClose = vi.fn();
    editor.on('close', onClose);
    editor.close();
    editor.close();
    expect(container.querySelector('iframe')).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dispatches lifecycle messages from the cms origin', () => {
    const editor = root.openEditor('Pages/about', {
      mode: 'iframe',
      container,
    });
    const onSaved = vi.fn();
    editor.on('saved', onSaved);
    dispatchMessage(
      {root: {type: 'saved', docId: 'Pages/about'}},
      CMS_ORIGIN,
      editor.element!.contentWindow
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({docId: 'Pages/about'})
    );
    editor.close();
  });

  it('ignores messages from other origins', () => {
    const editor = root.openEditor('Pages/about', {
      mode: 'iframe',
      container,
    });
    const onSaved = vi.fn();
    editor.on('saved', onSaved);
    dispatchMessage(
      {root: {type: 'saved'}},
      'https://evil.example.com',
      editor.element!.contentWindow
    );
    expect(onSaved).not.toHaveBeenCalled();
    editor.close();
  });

  it('ignores messages from other windows', () => {
    const editor = root.openEditor('Pages/about', {
      mode: 'iframe',
      container,
    });
    const onSaved = vi.fn();
    editor.on('saved', onSaved);
    // Right origin, but not this handle's iframe.
    dispatchMessage({root: {type: 'saved'}}, CMS_ORIGIN, window);
    dispatchMessage({root: {type: 'saved'}}, CMS_ORIGIN, null);
    expect(onSaved).not.toHaveBeenCalled();
    editor.close();
  });

  it('buffers focusField() until the editor is ready', () => {
    const editor = root.openEditor('Pages/about', {
      mode: 'iframe',
      container,
    });
    const postMessage = vi.spyOn(editor.element!.contentWindow!, 'postMessage');
    editor.focusField('hero.title');
    expect(postMessage).not.toHaveBeenCalled();
    dispatchMessage(
      {root: {type: 'ready', docId: 'Pages/about'}},
      CMS_ORIGIN,
      editor.element!.contentWindow
    );
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      {scrollToDeeplink: {deepKey: 'hero.title'}},
      CMS_ORIGIN
    );
    // After ready, messages post immediately.
    editor.focusField('hero.image');
    expect(postMessage).toHaveBeenCalledTimes(2);
    editor.close();
  });
});

describe('openEditor (popup mode)', () => {
  let root: RootCMSBrowserClient;
  let popup: {
    closed: boolean;
    close: () => void;
    postMessage: (message: unknown, targetOrigin: string) => void;
    location: {href: string};
  };
  let windowOpen: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    root = new RootCMSBrowserClient({cmsOrigin: CMS_ORIGIN});
    popup = {
      closed: false,
      close: vi.fn(() => {
        popup.closed = true;
      }),
      postMessage: vi.fn(),
      location: {href: ''},
    };
    windowOpen = vi
      .spyOn(window, 'open')
      .mockReturnValue(popup as unknown as Window);
  });

  afterEach(() => {
    windowOpen.mockRestore();
    vi.useRealTimers();
  });

  it('opens a popup window with the embed url', () => {
    const editor = root.openEditor('Pages/about', {width: 600, height: 800});
    expect(windowOpen).toHaveBeenCalledWith(
      `${CMS_ORIGIN}/cms/embed/content/Pages/about`,
      '_blank',
      'popup,width=600,height=800'
    );
    expect(editor.window).toBe(popup);
    expect(editor.element).toBeNull();
    editor.close();
    expect(popup.close).toHaveBeenCalled();
  });

  it('emits close when the user closes the popup', () => {
    vi.useFakeTimers();
    const editor = root.openEditor('Pages/about');
    const onClose = vi.fn();
    editor.on('close', onClose);
    popup.closed = true;
    vi.advanceTimersByTime(500);
    expect(onClose).toHaveBeenCalledTimes(1);
    // The poll timer is cleared after close.
    vi.advanceTimersByTime(5000);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('emits error when the popup is blocked', async () => {
    windowOpen.mockReturnValue(null);
    const editor = root.openEditor('Pages/about');
    const onError = vi.fn();
    const onClose = vi.fn();
    editor.on('error', onError);
    editor.on('close', onClose);
    await Promise.resolve();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({error: expect.stringContaining('popup')})
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reload() re-navigates the popup', () => {
    const editor = root.openEditor('Pages/about');
    editor.reload();
    expect(popup.location.href).toEqual(
      `${CMS_ORIGIN}/cms/embed/content/Pages/about`
    );
    editor.close();
  });
});

describe('openRootAI', () => {
  let root: RootCMSBrowserClient;
  let container: HTMLElement;

  beforeEach(() => {
    root = new RootCMSBrowserClient({cmsOrigin: CMS_ORIGIN});
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('creates an iframe with the ai embed url', () => {
    const ai = root.openRootAI({mode: 'iframe', container});
    expect(ai.element!.src).toEqual(`${CMS_ORIGIN}/cms/embed/ai`);
    ai.close();
  });

  it('adds the docId query param', () => {
    const ai = root.openRootAI({
      mode: 'iframe',
      container,
      docId: 'Pages/about',
    });
    expect(ai.element!.src).toEqual(
      `${CMS_ORIGIN}/cms/embed/ai?docId=Pages%2Fabout`
    );
    ai.close();
  });
});

describe('connectPreview', () => {
  const originalParent = Object.getOwnPropertyDescriptor(window, 'parent');

  function mockParentWindow() {
    const parentWindow = {postMessage: vi.fn()};
    Object.defineProperty(window, 'parent', {
      value: parentWindow,
      configurable: true,
    });
    return parentWindow;
  }

  afterEach(() => {
    if (originalParent) {
      Object.defineProperty(window, 'parent', originalParent);
    }
  });

  it('is inert at the top level', () => {
    const preview = RootCMSBrowserClient.connectPreview();
    expect(preview.isEmbedded).toBe(false);
    // No parent to post to; should not throw.
    preview.focusField('hero.title');
    preview.disconnect();
  });

  it('focusField() posts scrollToDeeplink to the parent window', () => {
    const parentWindow = mockParentWindow();
    const preview = RootCMSBrowserClient.connectPreview();
    preview.focusField('hero.title');
    expect(parentWindow.postMessage).toHaveBeenCalledWith(
      {scrollToDeeplink: {deepKey: 'hero.title'}},
      window.location.origin
    );
    preview.disconnect();
  });

  it('emits highlight events for same-origin highlightNode messages', () => {
    const preview = RootCMSBrowserClient.connectPreview();
    const onHighlight = vi.fn();
    preview.on('highlight', onHighlight);
    dispatchMessage(
      {highlightNode: {deepKey: 'hero.title', options: {scroll: true}}},
      window.location.origin,
      null
    );
    expect(onHighlight).toHaveBeenCalledTimes(1);
    expect(onHighlight).toHaveBeenCalledWith({
      deepKey: 'hero.title',
      scroll: true,
    });
    // A null deepKey clears highlights.
    dispatchMessage(
      {highlightNode: {deepKey: null}},
      window.location.origin,
      null
    );
    expect(onHighlight).toHaveBeenCalledWith({deepKey: null, scroll: false});
    preview.disconnect();
  });

  it('ignores highlightNode messages from other origins', () => {
    const preview = RootCMSBrowserClient.connectPreview();
    const onHighlight = vi.fn();
    preview.on('highlight', onHighlight);
    dispatchMessage(
      {highlightNode: {deepKey: 'hero.title'}},
      'https://evil.example.com',
      null
    );
    expect(onHighlight).not.toHaveBeenCalled();
    preview.disconnect();
  });

  it('disconnect() stops emitting events', () => {
    const preview = RootCMSBrowserClient.connectPreview();
    const onHighlight = vi.fn();
    preview.on('highlight', onHighlight);
    preview.disconnect();
    dispatchMessage(
      {highlightNode: {deepKey: 'hero.title'}},
      window.location.origin,
      null
    );
    expect(onHighlight).not.toHaveBeenCalled();
  });
});
