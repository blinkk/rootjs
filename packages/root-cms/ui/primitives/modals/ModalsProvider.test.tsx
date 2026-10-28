import {act, cleanup, fireEvent, render, screen} from '@testing-library/preact';
import {useEffect} from 'preact/hooks';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Dialog, DialogFooter} from '../Dialog/Dialog.js';
import {
  type ContextModalProps,
  type ModalsContextProps,
  ModalsProvider,
  useModals,
} from './ModalsProvider.js';

function Greeting(props: ContextModalProps<{name: string}>) {
  return (
    <button onClick={() => props.context.closeModal(props.id)}>
      Hello {props.innerProps.name}
    </button>
  );
}

/** A context modal that renders its actions through `DialogFooter`. */
function WithFooter(props: ContextModalProps<{label: string}>) {
  return (
    <>
      <p>Body</p>
      <DialogFooter>
        <button>{props.innerProps.label}</button>
      </DialogFooter>
    </>
  );
}

/** Renders a provider and returns its `useModals()` value. */
function setup() {
  let modals!: ModalsContextProps;
  function Capture() {
    modals = useModals();
    return null;
  }
  render(
    <ModalsProvider modals={{Greeting, WithFooter}}>
      <Capture />
    </ModalsProvider>
  );
  return () => modals;
}

afterEach(() => cleanup());

describe('ModalsProvider', () => {
  it('opens context modals with innerProps and stacks them', () => {
    const modals = setup();
    let first = '';
    act(() => {
      first = modals().openContextModal('Greeting', {
        title: 'First',
        innerProps: {name: 'Ada'},
      });
      modals().openContextModal('Greeting', {
        title: 'Second',
        innerProps: {name: 'Grace'},
      });
    });
    expect(screen.getByText('Hello Ada')).toBeTruthy();
    expect(screen.getByText('Hello Grace')).toBeTruthy();
    expect(modals().modals.map((m) => m.props.title)).toEqual([
      'First',
      'Second',
    ]);

    act(() => modals().closeModal(first));
    expect(screen.queryByText('Hello Ada')).toBeNull();
    expect(screen.getByText('Hello Grace')).toBeTruthy();

    // A context modal can close itself through `context.closeModal(id)`.
    fireEvent.click(screen.getByText('Hello Grace'));
    expect(modals().modals).toEqual([]);
  });

  it('closes the topmost modal of a kind when given its key', () => {
    const modals = setup();
    const onClose = vi.fn();
    act(() => {
      modals().openConfirmModal({title: 'Confirm', children: 'Sure?'});
      modals().openContextModal('Greeting', {
        innerProps: {name: 'Ada'},
        onClose,
      });
    });
    act(() => modals().closeModal('Greeting'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(modals().modals.map((m) => m.type)).toEqual(['confirm']);
  });

  it('runs confirm callbacks and honors closeOnConfirm', () => {
    const modals = setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    act(() => {
      modals().openConfirmModal({
        title: 'Delete doc',
        labels: {confirm: 'Delete', cancel: 'Keep'},
        confirmProps: {color: 'red'},
        closeOnConfirm: false,
        onConfirm,
        onCancel,
      });
    });
    const confirm = screen.getByText('Delete').closest('button')!;
    expect(confirm.className).toContain('Button--variant-danger');

    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(modals().modals).toHaveLength(1);

    fireEvent.click(screen.getByText('Keep'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(modals().modals).toHaveLength(0);
  });

  it('closes on the close button without calling onCancel', () => {
    const modals = setup();
    const onCancel = vi.fn();
    const onClose = vi.fn();
    act(() => {
      modals().openConfirmModal({title: 'Leave?', onCancel, onClose});
    });
    fireEvent.click(screen.getByLabelText('Close'));
    expect(modals().modals).toHaveLength(0);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('closeAll closes every modal and calls each onClose', () => {
    const modals = setup();
    const onClose = vi.fn();
    act(() => {
      modals().openModal({title: 'A', children: 'a', onClose});
      modals().openContextModal('Greeting', {innerProps: {name: 'B'}, onClose});
    });
    act(() => modals().closeAll());
    expect(modals().modals).toEqual([]);
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(document.querySelector('dialog')).toBeNull();
  });

  it("renders a context modal's DialogFooter and bodyClassName", async () => {
    const modals = setup();
    act(() => {
      modals().openContextModal('WithFooter', {
        innerProps: {label: 'Save'},
        bodyClassName: 'pb-0',
      });
    });
    // The footer element mounts first, then `DialogFooter` portals into it.
    await act(async () => {});
    const save = screen.getByText('Save');
    expect(save.parentElement?.classList.contains('Dialog__footer')).toBe(true);
    const body = screen.getByText('Body').parentElement!;
    expect(body.classList.contains('Dialog__body')).toBe(true);
    expect(body.classList.contains('pb-0')).toBe(true);
  });
});

describe('Dialog', () => {
  it('renders its content only while open', () => {
    const onMount = vi.fn();
    function Content() {
      useEffect(() => onMount(), []);
      return <p>Content</p>;
    }
    function Demo(props: {open: boolean}) {
      return (
        <Dialog open={props.open} onClose={() => {}} title="Title">
          <Content />
        </Dialog>
      );
    }
    const {rerender} = render(<Demo open={false} />);
    expect(document.querySelector('dialog')).toBeTruthy();
    expect(screen.queryByText('Title')).toBeNull();
    expect(onMount).not.toHaveBeenCalled();

    rerender(<Demo open />);
    expect(screen.getByText('Content')).toBeTruthy();
    expect(onMount).toHaveBeenCalledTimes(1);

    rerender(<Demo open={false} />);
    expect(screen.queryByText('Content')).toBeNull();
  });
});
