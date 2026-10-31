import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/preact';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {lazyComponent} from './lazy-component.js';

const FAST_RETRY = {attempts: 1, retryDelayMs: 0};

function Loaded() {
  return <div>loaded</div>;
}

describe('lazyComponent', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the component once it loads, without importing it twice', async () => {
    const factory = vi.fn(async () => Loaded);
    const Lazy = lazyComponent(factory, {
      ...FAST_RETRY,
      fallback: <div>loading</div>,
    });
    const first = render(<Lazy />);
    expect(screen.getByText('loading')).toBeTruthy();
    await screen.findByText('loaded');
    first.unmount();

    render(<Lazy />);
    // A later mount renders right away, with no loading state.
    expect(screen.getByText('loaded')).toBeTruthy();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('shows an error when the import fails, and recovers on retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const factory = vi
      .fn<() => Promise<typeof Loaded>>()
      .mockRejectedValueOnce(new Error('chunk not found'))
      .mockResolvedValue(Loaded);
    const Lazy = lazyComponent(factory, FAST_RETRY);
    render(<Lazy />);

    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', {name: 'Try again'}));
    await screen.findByText('loaded');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('applies dialog autofocus to content that loads after the dialog opens', async () => {
    function Input() {
      return <input data-autofocus aria-label="search" />;
    }
    const Lazy = lazyComponent(async () => Input, FAST_RETRY);
    render(
      <dialog open>
        <button>close</button>
        <Lazy />
      </dialog>
    );
    screen.getByRole('button', {name: 'close'}).focus();
    const input = await screen.findByLabelText('search');
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it('shares one import between preload() and rendering', async () => {
    const factory = vi.fn(async () => Loaded);
    const Lazy = lazyComponent(factory, FAST_RETRY);
    await Lazy.preload();
    render(<Lazy />);
    await waitFor(() => expect(screen.getByText('loaded')).toBeTruthy());
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
