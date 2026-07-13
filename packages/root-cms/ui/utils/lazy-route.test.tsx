import {cleanup, render} from '@testing-library/preact';
import {FunctionComponent} from 'preact';
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {
  ROUTE_IMPORT_RELOAD_KEY,
  importRouteComponent,
  lazyRoute,
} from './lazy-route.js';

vi.mock('@mantine/core', async () => {
  const actual: any = await vi.importActual('@mantine/core');
  return {
    ...actual,
    Button: ({children, onClick}: any) => (
      <button onClick={onClick}>{children}</button>
    ),
    Loader: () => <div>loading...</div>,
  };
});

// The app frame requires the router location context and the global firebase
// objects, which aren't available in tests.
vi.mock('../layout/Layout.js', () => {
  return {
    Layout: ({children}: any) => <div className="Layout">{children}</div>,
  };
});

function TestComponent() {
  return <div>test page</div>;
}

// The testing library's auto-cleanup requires vitest globals, which aren't
// enabled, so clean up rendered components explicitly to keep tests isolated.
afterEach(() => {
  cleanup();
});

describe('importRouteComponent', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  test('resolves with the component when the import succeeds', async () => {
    const factory = vi.fn().mockResolvedValue(TestComponent);
    const reload = vi.fn();
    const component = await importRouteComponent(factory, {
      retryDelayMs: 0,
      reload,
    });
    expect(component).toBe(TestComponent);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  test('retries failed imports before succeeding', async () => {
    const factory = vi
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValue(TestComponent);
    const reload = vi.fn();
    const component = await importRouteComponent(factory, {
      retryDelayMs: 0,
      reload,
    });
    expect(component).toBe(TestComponent);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(reload).not.toHaveBeenCalled();
  });

  test('reloads the page when all import attempts fail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const factory = vi.fn().mockRejectedValue(new Error('fetch failed'));
    const reload = vi.fn();
    // The returned promise doesn't settle until a grace period after the
    // reload is triggered, so wait on the reload spy instead of awaiting the
    // result.
    void importRouteComponent(factory, {retryDelayMs: 0, reload});
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(factory).toHaveBeenCalledTimes(3);
    expect(window.sessionStorage.getItem(ROUTE_IMPORT_RELOAD_KEY)).toBeTruthy();
  });

  test('falls back to an error screen if the triggered reload never happens', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const factory = vi.fn().mockRejectedValue(new Error('fetch failed'));
    const reload = vi.fn();
    vi.useFakeTimers();
    let ErrorComponent: FunctionComponent;
    try {
      const promise = importRouteComponent(factory, {retryDelayMs: 0, reload});
      // Run through the retry delays and the post-reload grace period.
      await vi.advanceTimersByTimeAsync(60 * 1000);
      expect(reload).toHaveBeenCalledTimes(1);
      ErrorComponent = await promise;
    } finally {
      // Restore real timers before rendering so the testing library's
      // auto-cleanup works as usual.
      vi.useRealTimers();
    }
    const result = render(<ErrorComponent />);
    expect(result.getByText('Page failed to load')).toBeTruthy();
    expect(result.getByText('fetch failed')).toBeTruthy();
  });

  test('falls back to an error screen if a reload was recently attempted', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.sessionStorage.setItem(ROUTE_IMPORT_RELOAD_KEY, String(Date.now()));
    const factory = vi.fn().mockRejectedValue(new Error('fetch failed'));
    const reload = vi.fn();
    const ErrorComponent = await importRouteComponent(factory, {
      retryDelayMs: 0,
      reload,
    });
    expect(reload).not.toHaveBeenCalled();
    const result = render(<ErrorComponent />);
    expect(result.getByText('Page failed to load')).toBeTruthy();
    expect(result.getByText('fetch failed')).toBeTruthy();
  });
});

describe('lazyRoute', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  test('shows a loading indicator until the import resolves', async () => {
    let resolveImport!: (component: FunctionComponent) => void;
    const factory = vi.fn(
      () =>
        new Promise<FunctionComponent>((resolve) => {
          resolveImport = resolve;
        })
    );
    const LazyComponent = lazyRoute(factory);
    const result = render(<LazyComponent />);
    // The loading screen renders within the app frame by default.
    expect(
      result.container.querySelector('.Layout .RouteLoading')
    ).toBeTruthy();
    resolveImport(TestComponent);
    await result.findByText('test page');
    expect(result.container.querySelector('.RouteLoading')).toBeFalsy();
  });

  test('shows a frameless loading indicator for frameless routes', () => {
    const factory = vi.fn(() => new Promise<FunctionComponent>(() => {}));
    const LazyComponent = lazyRoute(factory, {frame: false});
    const result = render(<LazyComponent />);
    expect(result.container.querySelector('.RouteLoading')).toBeTruthy();
    expect(result.container.querySelector('.Layout')).toBeFalsy();
  });

  test('renders immediately once the import has resolved', async () => {
    const factory = vi.fn().mockResolvedValue(TestComponent);
    const LazyComponent = lazyRoute(factory);
    const first = render(<LazyComponent />);
    await first.findByText('test page');
    first.unmount();

    const second = render(<LazyComponent />);
    expect(second.container.querySelector('.RouteLoading')).toBeFalsy();
    expect(second.container.textContent).toContain('test page');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  test('renders the error screen when the import fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.sessionStorage.setItem(ROUTE_IMPORT_RELOAD_KEY, String(Date.now()));
    const factory = vi.fn().mockRejectedValue(new Error('fetch failed'));
    const reload = vi.fn();
    const LazyComponent = lazyRoute(factory, {retryDelayMs: 0, reload});
    const result = render(<LazyComponent />);
    expect(result.container.querySelector('.RouteLoading')).toBeTruthy();
    await result.findByText('Page failed to load');
    expect(reload).not.toHaveBeenCalled();
  });

  test('retries the import on remount after a failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.sessionStorage.setItem(ROUTE_IMPORT_RELOAD_KEY, String(Date.now()));
    // The first mount exhausts all 3 attempts; the import succeeds on the
    // 4th call, which happens when the route is mounted a second time.
    const factory = vi
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValue(TestComponent);
    const reload = vi.fn();
    const LazyComponent = lazyRoute(factory, {retryDelayMs: 0, reload});
    const first = render(<LazyComponent />);
    await first.findByText('Page failed to load');
    first.unmount();

    const second = render(<LazyComponent />);
    await second.findByText('test page');
    expect(factory).toHaveBeenCalledTimes(4);
    expect(reload).not.toHaveBeenCalled();
  });
});
