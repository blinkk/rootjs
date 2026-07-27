import {cleanup, render, waitFor} from '@testing-library/preact';
import {LocationProvider, useLocation} from 'preact-iso';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {DeeplinkProvider, DeeplinkContext, useDeeplink} from './useDeeplink.js';

interface TestAppProps {
  /** Called on every render with preact-iso's `route()`. */
  onRoute?: (route: (url: string) => void) => void;
  /** Called on every render with the deeplink context. */
  onDeeplink?: (deeplink: DeeplinkContext) => void;
}

function TestApp(props: TestAppProps) {
  return (
    <LocationProvider>
      <DeeplinkProvider>
        <DeeplinkValue {...props} />
      </DeeplinkProvider>
    </LocationProvider>
  );
}

function DeeplinkValue(props: TestAppProps) {
  const deeplink = useDeeplink();
  const location = useLocation();
  props.onRoute?.(location.route);
  props.onDeeplink?.(deeplink);
  return (
    // `scrollToDeeplink()` scrolls `.DocumentPage__side`, the doc editor's
    // scroll container.
    <div className="DocumentPage__side">
      <div data-testid="value">{deeplink.value}</div>
      <div id="fields.hero.title" />
    </div>
  );
}

describe('DeeplinkProvider', () => {
  let scroll: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.history.replaceState({}, '', '/cms/content/Pages/index');
    scroll = vi.fn();
    // jsdom has no layout engine and doesn't implement scrolling.
    Element.prototype.scroll = scroll as any;
  });

  afterEach(() => cleanup());

  it('reads the deeplink from the url on load', async () => {
    window.history.replaceState(
      {},
      '',
      '/cms/content/Pages/index?deeplink=fields.hero.title'
    );
    const {getByTestId} = render(<TestApp />);
    await waitFor(() => {
      expect(getByTestId('value').textContent).toEqual('fields.hero.title');
    });
  });

  it('picks up a deeplink added by a client-side url change', async () => {
    let route!: (url: string) => void;
    const {getByTestId} = render(<TestApp onRoute={(r) => (route = r)} />);
    expect(getByTestId('value').textContent).toEqual('');

    route('/cms/content/Pages/index?deeplink=fields.hero.title');

    await waitFor(() => {
      expect(getByTestId('value').textContent).toEqual('fields.hero.title');
    });
    // The targeted field is scrolled into view even though the editor may
    // already be scrolled from wherever the user navigated from.
    await waitFor(() => {
      expect(scroll).toHaveBeenCalled();
    });
  });

  it('clears the deeplink when the url no longer has one', async () => {
    window.history.replaceState(
      {},
      '',
      '/cms/content/Pages/index?deeplink=fields.hero.title'
    );
    let route!: (url: string) => void;
    const {getByTestId} = render(<TestApp onRoute={(r) => (route = r)} />);
    await waitFor(() => {
      expect(getByTestId('value').textContent).toEqual('fields.hero.title');
    });

    route('/cms/content/Pages/index');

    await waitFor(() => {
      expect(getByTestId('value').textContent).toEqual('');
    });
  });

  it('setUrlValue() mirrors the deeplink into the url', async () => {
    let deeplink!: DeeplinkContext;
    const {getByTestId} = render(
      <TestApp onDeeplink={(d) => (deeplink = d)} />
    );

    deeplink.setUrlValue('fields.hero.title');

    await waitFor(() => {
      expect(getByTestId('value').textContent).toEqual('fields.hero.title');
    });
    expect(window.location.search).toEqual('?deeplink=fields.hero.title');
  });

  it('does not re-apply a deeplink set by setUrlValue()', async () => {
    let deeplink!: DeeplinkContext;
    let route!: (url: string) => void;
    render(
      <TestApp
        onDeeplink={(d) => (deeplink = d)}
        onRoute={(r) => (route = r)}
      />
    );

    deeplink.setUrlValue('fields.hero.title');
    await waitFor(() => expect(deeplink.value).toEqual('fields.hero.title'));
    scroll.mockClear();

    // A later navigation that keeps the same deeplink shouldn't yank the
    // editor's scroll position back to the field.
    route('/cms/content/Pages/index?deeplink=fields.hero.title&locale=de');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(scroll).not.toHaveBeenCalled();
  });
});
