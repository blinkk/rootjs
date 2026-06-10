import {render} from '@testing-library/preact';
import {beforeEach, describe, expect, test, vi} from 'vitest';
import {ROUTE_IMPORT_RELOAD_KEY, importRouteComponent} from './lazy-route.js';

vi.mock('@mantine/core', async () => {
  const actual: any = await vi.importActual('@mantine/core');
  return {
    ...actual,
    Button: ({children, onClick}: any) => (
      <button onClick={onClick}>{children}</button>
    ),
  };
});

function TestComponent() {
  return <div>test page</div>;
}

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
    // The returned promise intentionally never settles when reloading, so
    // wait on the reload spy instead of awaiting the result.
    void importRouteComponent(factory, {retryDelayMs: 0, reload});
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(factory).toHaveBeenCalledTimes(3);
    expect(window.sessionStorage.getItem(ROUTE_IMPORT_RELOAD_KEY)).toBeTruthy();
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
