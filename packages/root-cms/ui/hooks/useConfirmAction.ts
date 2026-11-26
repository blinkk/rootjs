import type {ComponentChildren} from 'preact';
import {useCallback} from 'preact/hooks';
import {
  type ConfirmButtonProps,
  useModals,
} from '../primitives/modals/ModalsProvider.js';
import {
  showNotification,
  updateNotification,
} from '../primitives/Toast/toastStore.js';
import {errorMessage} from '../utils/notifications.js';

/** Toast messages shown while an async confirmed action runs. */
export interface ConfirmActionToast {
  /** Unique notification ID used to update the loading toast in place. */
  id: string;
  /** Shown while `action` is in flight. */
  loading: {title: string; message: string};
  /** Shown once `action` resolves. */
  success: {
    title: string;
    message: string;
    color?: string;
    autoClose?: number | false;
  };
  /** Title shown if `action` throws. Defaults to `loading.title`. */
  errorTitle?: string;
}

/** Options passed to `confirmAction()`. */
export interface ConfirmActionOptions {
  /** Modal header title. */
  title: string;
  /** Modal body content. */
  body: ComponentChildren;
  /** Label for the confirm button. */
  confirmLabel: string;
  /** Label for the cancel button. Defaults to `'Cancel'`. */
  cancelLabel?: string;
  /** Renders the confirm button in red (`danger`) when true. */
  danger?: boolean;
  /** Extra props merged onto the confirm button. */
  confirmProps?: ConfirmButtonProps;
  /** Extra props merged onto the cancel button. */
  cancelProps?: ConfirmButtonProps;
  /** Optional loading/success/error toast lifecycle tied to `action`. */
  toast?: ConfirmActionToast;
  /** Async work executed when the user confirms. */
  action: () => Promise<void> | void;
  /** Called after `action` succeeds and the modal closes. */
  onSuccess?: () => void;
}

/**
 * Returns a helper that opens a confirmation modal, runs an async action with
 * optional loading/success/error toast updates, and ensures the modal and
 * loading toast always settle cleanly even when the action throws.
 */
export function useConfirmAction() {
  const modals = useModals();

  return useCallback(
    (options: ConfirmActionOptions) => {
      const {
        title,
        body,
        confirmLabel,
        cancelLabel = 'Cancel',
        danger = false,
        confirmProps,
        cancelProps,
        toast,
        action,
        onSuccess,
      } = options;

      const modalId = modals.openConfirmModal({
        title,
        children: body,
        labels: {confirm: confirmLabel, cancel: cancelLabel},
        cancelProps: {size: 'xs', ...cancelProps},
        confirmProps: {
          color: danger ? 'red' : 'dark',
          size: 'xs',
          ...confirmProps,
        },
        closeOnConfirm: false,
        onConfirm: async () => {
          if (toast) {
            showNotification({
              id: toast.id,
              title: toast.loading.title,
              message: toast.loading.message,
              loading: true,
              autoClose: false,
            });
          }
          try {
            await action();
            if (toast) {
              updateNotification({
                id: toast.id,
                title: toast.success.title,
                message: toast.success.message,
                color: toast.success.color,
                loading: false,
                autoClose: toast.success.autoClose ?? 5000,
              });
            }
            modals.closeModal(modalId);
            onSuccess?.();
          } catch (err) {
            console.error(err);
            const message = errorMessage(err);
            if (toast) {
              updateNotification({
                id: toast.id,
                title: toast.errorTitle || toast.loading.title,
                message,
                color: 'red',
                loading: false,
                autoClose: false,
              });
            } else {
              showNotification({
                title,
                message,
                color: 'red',
                autoClose: false,
              });
            }
            modals.closeModal(modalId);
          }
        },
      });

      return modalId;
    },
    [modals]
  );
}
