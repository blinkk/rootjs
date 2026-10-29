import {act, cleanup, fireEvent, render, screen} from '@testing-library/preact';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Toaster} from './Toast.js';
import {createToastStore, type ToastStore} from './toastStore.js';

describe('toast store', () => {
  it('shows, updates and hides toasts by id', () => {
    const store = createToastStore();
    const onClose = vi.fn();
    const id = store.show({id: 'save', message: 'Saving…', loading: true});
    expect(id).toBe('save');
    // Showing an id that's already shown is a no-op, as in Mantine.
    store.show({id: 'save', message: 'Duplicate'});
    expect(store.getToasts()).toHaveLength(1);

    // Updates replace the whole toast.
    store.update({id: 'save', message: 'Saved', color: 'green', onClose});
    expect(store.getToasts()).toEqual([
      {id: 'save', message: 'Saved', color: 'green', onClose},
    ]);

    store.hide('save');
    expect(store.getToasts()).toEqual([]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Toaster', () => {
  let store: ToastStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = createToastStore();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('auto-closes after the delay, paused while hovered', () => {
    render(<Toaster store={store} autoClose={1000} />);
    act(() => {
      store.show({message: 'Default delay'});
      store.show({message: 'Sticky', autoClose: false});
    });
    const toast = screen.getByText('Default delay').closest('.Toast')!;

    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.mouseEnter(toast);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('Default delay')).not.toBeNull();

    // Resumes with the time that was left.
    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(screen.queryByText('Default delay')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Default delay')).toBeNull();
    expect(screen.queryByText('Sticky')).not.toBeNull();
  });

  it('restarts the timer when a loading toast is updated', () => {
    render(<Toaster store={store} />);
    act(() => {
      store.show({
        id: 'p',
        message: 'Publishing',
        loading: true,
        autoClose: false,
      });
    });
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    act(() => store.update({id: 'p', message: 'Published', autoClose: 2000}));
    expect(screen.getByText('Published')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(store.getToasts()).toEqual([]);
  });

  it('shows at most `limit` toasts and dismisses on click', () => {
    render(<Toaster store={store} limit={2} autoClose={false} />);
    act(() => {
      store.show({message: 'one'});
      store.show({message: 'two'});
      store.show({message: 'three', color: 'red'});
    });
    expect(screen.queryByText('three')).toBeNull();

    fireEvent.click(screen.getAllByLabelText('Dismiss notification')[0]);
    expect(screen.queryByText('one')).toBeNull();
    // Errors are announced assertively.
    expect(screen.getByText('three').closest('[role="alert"]')).not.toBeNull();
  });
});
