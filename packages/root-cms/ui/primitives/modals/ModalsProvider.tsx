import type {ComponentChildren, ComponentType} from 'preact';
import {createContext} from 'preact';
import {useContext, useMemo, useRef, useState} from 'preact/hooks';
import {Button, type ButtonSize, type ButtonVariant} from '../Button/Button.js';
import {Dialog, type DialogSize} from '../Dialog/Dialog.js';

/**
 * Options for any modal, mirroring the `@mantine/modals` 4.2.12 options the
 * CMS passes. Options that only tuned Mantine's look are accepted (so call
 * sites compile unchanged) but ignored; the dialog's look comes from tokens.
 */
export interface ModalSettings {
  /** Id for `closeModal()`. Generated when omitted. */
  id?: string;
  /** Heading, also the dialog's accessible name. */
  title?: ComponentChildren;
  /** Width from `md` up; see `DialogSize`. Default `md` (440px). */
  size?: DialogSize;
  /** Centers the dialog vertically from `md` up. */
  centered?: boolean;
  /** Whether Escape closes the modal. Default true. */
  closeOnEscape?: boolean;
  /** Whether a backdrop click closes the modal. Default true. */
  closeOnClickOutside?: boolean;
  /** Whether to show the header's close button. Default true. */
  withCloseButton?: boolean;
  /** Classes for the root `<dialog>`; parts have `Dialog__*` BEM hooks. */
  className?: string;
  /** Classes for the visible panel (`Dialog__panel`). */
  panelClassName?: string;
  /** Classes for the scrolling body (`Dialog__body`), e.g. `pb-0`. */
  bodyClassName?: string;
  /**
   * Actions pinned below the body; see `Dialog`'s `footer`. Ignored by
   * confirm modals, whose footer is their buttons. A context modal whose
   * actions depend on its own state renders them with `<DialogFooter>`
   * instead.
   */
  footer?: ComponentChildren;
  /** Called whenever the modal closes, however it was closed. */
  onClose?: () => void;
  /** Ignored: the body always scrolls inside the dialog. */
  overflow?: 'inside' | 'outside';
  /** Ignored: the backdrop uses the `--cms-color-overlay` token. */
  overlayColor?: string;
  /** Ignored, see `overlayColor`. */
  overlayOpacity?: number;
  /** Ignored, see `overlayColor`. */
  overlayBlur?: number;
  /** Ignored: modals stack in the browser's top layer. */
  zIndex?: number;
}

/** Options for `openModal()`. */
export interface OpenModal extends ModalSettings {
  children?: ComponentChildren;
}

/** Props for a confirm modal's buttons, a subset of Mantine's `Button`. */
export interface ConfirmButtonProps {
  /** Overrides the label from `labels`. */
  children?: ComponentChildren;
  /**
   * Mantine color. `red` makes the button `danger`; any other color keeps
   * the default (`primary` for confirm, `default` for cancel).
   */
  color?: string;
  /**
   * Mantine variant. `default`, `outline` and `white` map to `default`,
   * `subtle` to `subtle`; others keep the default.
   */
  variant?: string;
  /** Mantine size. `xs` maps to `sm` (28px); anything else to `md` (36px). */
  size?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  /** Called before `onConfirm` / `onCancel`. */
  onClick?: (e: MouseEvent) => void;
}

/** Options for `openConfirmModal()`. */
export interface OpenConfirmModal extends ModalSettings {
  /** Body content above the buttons. */
  children?: ComponentChildren;
  /** Button labels. */
  labels?: {confirm?: ComponentChildren; cancel?: ComponentChildren};
  confirmProps?: ConfirmButtonProps;
  cancelProps?: ConfirmButtonProps;
  /** Called when the confirm button is clicked. */
  onConfirm?: () => void;
  /**
   * Called when the cancel button is clicked. Like Mantine 4.2.12, not
   * called when the modal is dismissed (Escape, backdrop, close button).
   */
  onCancel?: () => void;
  /** Whether confirming closes the modal. Default true. */
  closeOnConfirm?: boolean;
  /** Whether cancelling closes the modal. Default true. */
  closeOnCancel?: boolean;
  /** Ignored: the buttons are always right-aligned. */
  groupProps?: Record<string, unknown>;
}

/** Options for `openContextModal()`. */
export interface OpenContextModal<
  P = Record<string, unknown>,
> extends ModalSettings {
  /** Passed to the registered component as `innerProps`. */
  innerProps: P;
}

/** One open modal. */
export type ModalState =
  | {id: string; type: 'content'; props: OpenModal}
  | {id: string; type: 'confirm'; props: OpenConfirmModal}
  | {id: string; type: 'context'; props: OpenContextModal<any>; ctx: string};

/** What `useModals()` returns. */
export interface ModalsContextProps {
  /** Open modals, bottom to top. */
  modals: ModalState[];
  /** Opens a modal with arbitrary content. Returns its id. */
  openModal: (props: OpenModal) => string;
  /** Opens a confirm / cancel modal. Returns its id. */
  openConfirmModal: (props: OpenConfirmModal) => string;
  /**
   * Opens a modal registered with `ModalsProvider`'s `modals` prop. Returns
   * its id.
   */
  openContextModal: <P = Record<string, unknown>>(
    modal: string,
    props: OpenContextModal<P>
  ) => string;
  /**
   * Closes a modal. `id` is the id an `open*()` call returned; for a context
   * modal it can also be the key it was registered under, which closes the
   * topmost modal of that kind. `canceled` also calls a confirm modal's
   * `onCancel`.
   */
  closeModal: (id: string, canceled?: boolean) => void;
  /** Closes every open modal. */
  closeAll: () => void;
}

/** Props passed to a component registered as a context modal. */
export interface ContextModalProps<T = Record<string, unknown>> {
  context: ModalsContextProps;
  innerProps: T;
  /** This modal's id, e.g. for `context.closeModal(id)`. */
  id: string;
}

const ModalsContext = createContext<ModalsContextProps | null>(null);

export interface ModalsProviderProps {
  /**
   * Components that can be opened with `openContextModal(key, ...)`, keyed
   * by name.
   */
  modals?: Record<string, ComponentType<ContextModalProps<any>>>;
  children?: ComponentChildren;
}

let nextId = 0;

function generateId() {
  nextId += 1;
  return `modal-${nextId}`;
}

/**
 * Renders modals opened through `useModals()`, as stacked `Dialog`s: a modal
 * opened from another stays on top of it until closed. A drop-in for
 * `@mantine/modals`' `ModalsProvider`.
 *
 * ```tsx
 * <ModalsProvider modals={{[PublishDocModal.id]: PublishDocModal}}>
 *   <App />
 * </ModalsProvider>
 * ```
 */
export function ModalsProvider(props: ModalsProviderProps) {
  const [modals, setModals] = useState<ModalState[]>([]);
  // The source of truth, so several calls in one tick see each other.
  const modalsRef = useRef<ModalState[]>([]);
  const registryRef = useRef(props.modals);
  registryRef.current = props.modals;

  const actions = useMemo(() => {
    function commit(next: ModalState[]) {
      modalsRef.current = next;
      setModals(next);
    }

    function open(modal: ModalState) {
      commit([...modalsRef.current, modal]);
      return modal.id;
    }

    function findModal(id: string): ModalState | undefined {
      const list = modalsRef.current;
      const byId = list.find((m) => m.id === id);
      if (byId) {
        return byId;
      }
      // `closeModal(MODAL_ID)`, where MODAL_ID is the context modal's key.
      const byKey = [...list]
        .reverse()
        .find((m) => m.type === 'context' && m.ctx === id);
      if (byKey) {
        return byKey;
      }
      // Mantine closes the only open modal whatever id is passed.
      return list.length === 1 ? list[0] : undefined;
    }

    function closeModal(id: string, canceled?: boolean) {
      const modal = findModal(id);
      if (!modal) {
        return;
      }
      commit(modalsRef.current.filter((m) => m !== modal));
      if (canceled && modal.type === 'confirm') {
        modal.props.onCancel?.();
      }
      modal.props.onClose?.();
    }

    function closeAll() {
      const closed = modalsRef.current;
      commit([]);
      closed.forEach((modal) => modal.props.onClose?.());
    }

    return {
      openModal: (props: OpenModal) =>
        open({id: props.id || generateId(), type: 'content', props}),
      openConfirmModal: (props: OpenConfirmModal) =>
        open({id: props.id || generateId(), type: 'confirm', props}),
      openContextModal: <P,>(modal: string, props: OpenContextModal<P>) =>
        open({
          id: props.id || generateId(),
          type: 'context',
          props,
          ctx: modal,
        }),
      closeModal,
      closeAll,
    };
  }, []);

  const context = useMemo<ModalsContextProps>(
    () => ({modals, ...actions}),
    [modals, actions]
  );

  return (
    <ModalsContext.Provider value={context}>
      {props.children}
      {modals.map((modal) => (
        <ModalDialog
          key={modal.id}
          modal={modal}
          context={context}
          registry={registryRef.current}
        />
      ))}
    </ModalsContext.Provider>
  );
}

/** Renders one open modal. */
function ModalDialog(props: {
  modal: ModalState;
  context: ModalsContextProps;
  registry: ModalsProviderProps['modals'];
}) {
  const {modal, context} = props;
  const settings = modal.props;
  let content: ComponentChildren;
  let footer: ComponentChildren = settings.footer;

  if (modal.type === 'context') {
    const Component = props.registry?.[modal.ctx];
    if (!Component) {
      console.error(`[ModalsProvider] no modal registered as "${modal.ctx}"`);
      return null;
    }
    content = (
      <Component
        context={context}
        id={modal.id}
        innerProps={modal.props.innerProps}
      />
    );
  } else {
    content = modal.props.children;
    if (modal.type === 'confirm') {
      footer = (
        <ConfirmButtons id={modal.id} props={modal.props} context={context} />
      );
    }
  }

  return (
    <Dialog
      open
      onClose={() => context.closeModal(modal.id)}
      title={settings.title}
      size={settings.size}
      centered={settings.centered}
      closeOnEscape={settings.closeOnEscape}
      closeOnClickOutside={settings.closeOnClickOutside}
      withCloseButton={settings.withCloseButton}
      className={settings.className}
      panelClassName={settings.panelClassName}
      bodyClassName={settings.bodyClassName}
      footer={footer}
      data-modal-id={modal.id}
    >
      {content}
    </Dialog>
  );
}

/** Maps Mantine button props onto `Button`'s variant and size. */
function buttonStyle(
  props: ConfirmButtonProps | undefined,
  fallback: ButtonVariant
): {variant: ButtonVariant; size: ButtonSize} {
  let variant = fallback;
  if (props?.color === 'red') {
    variant = 'danger';
  } else if (
    props?.variant === 'default' ||
    props?.variant === 'outline' ||
    props?.variant === 'white'
  ) {
    variant = 'default';
  } else if (props?.variant === 'subtle') {
    variant = 'subtle';
  }
  const size: ButtonSize = !props?.size || props.size === 'xs' ? 'sm' : 'md';
  return {variant, size};
}

/** The cancel and confirm buttons of a confirm modal. */
function ConfirmButtons(props: {
  id: string;
  props: OpenConfirmModal;
  context: ModalsContextProps;
}) {
  const {id, context} = props;
  const {
    labels,
    cancelProps,
    confirmProps,
    onCancel,
    onConfirm,
    closeOnCancel = true,
    closeOnConfirm = true,
  } = props.props;

  function cancel(e: MouseEvent) {
    cancelProps?.onClick?.(e);
    onCancel?.();
    if (closeOnCancel) {
      context.closeModal(id);
    }
  }

  function confirm(e: MouseEvent) {
    confirmProps?.onClick?.(e);
    onConfirm?.();
    if (closeOnConfirm) {
      context.closeModal(id);
    }
  }

  return (
    <>
      <Button
        {...buttonStyle(cancelProps, 'default')}
        className={cancelProps?.className}
        disabled={cancelProps?.disabled}
        loading={cancelProps?.loading}
        onClick={cancel}
      >
        {cancelProps?.children ?? labels?.cancel ?? 'Cancel'}
      </Button>
      <Button
        {...buttonStyle(confirmProps, 'primary')}
        className={confirmProps?.className}
        disabled={confirmProps?.disabled}
        loading={confirmProps?.loading}
        onClick={confirm}
      >
        {confirmProps?.children ?? labels?.confirm ?? 'Confirm'}
      </Button>
    </>
  );
}

/**
 * Opens and closes modals rendered by the nearest `ModalsProvider`. A
 * drop-in for `@mantine/modals`' `useModals()`.
 *
 * ```tsx
 * const modals = useModals();
 * modals.openConfirmModal({
 *   title: 'Delete doc',
 *   children: <p>There is no undo.</p>,
 *   labels: {confirm: 'Delete', cancel: 'Cancel'},
 *   confirmProps: {color: 'red'},
 *   onConfirm: () => deleteDoc(),
 * });
 * ```
 */
export function useModals(): ModalsContextProps {
  const context = useContext(ModalsContext);
  if (!context) {
    throw new Error(
      'useModals() was called outside of a <ModalsProvider>; wrap the app in one'
    );
  }
  return context;
}
