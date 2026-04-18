import {Button, InputWrapper, TextInput} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {showNotification} from '@mantine/notifications';
import {IconLock, IconLockOpen} from '@tabler/icons-preact';
import {ChangeEvent} from 'preact/compat';
import {useState} from 'preact/hooks';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {cmsLockPublishing, cmsUnlockPublishing} from '../../utils/doc.js';
import {notifyErrors} from '../../utils/notifications.js';
import {getLocalISOString} from '../../utils/time.js';
import {DocIdBadge} from '../DocIdBadge/DocIdBadge.js';
import {Text} from '../Text/Text.js';

import './LockPublishingModal.css';

const MODAL_ID = 'LockPublishingModal';

export interface ExistingLockInfo {
  reason: string;
  until?: number;
}

export interface LockPublishingModalProps {
  [key: string]: unknown;
  docId: string;
  unlock?: boolean;
  /**
   * When provided, the modal opens in "edit" mode with the current lock values
   * pre-filled. The user can either update the lock (by submitting the form)
   * or remove it (via the inline "Unlock" button).
   */
  existingLock?: ExistingLockInfo;
  onChange?: (state: 'locked' | 'unlocked') => void;
}

export function useLockPublishingModal(props: LockPublishingModalProps) {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: (options?: Partial<LockPublishingModalProps>) => {
      const modalProps = {...props, ...options};
      let title: string;
      if (modalProps.unlock) {
        title = `Unlock publishing for ${props.docId}`;
      } else if (modalProps.existingLock) {
        title = `Edit publishing lock for ${props.docId}`;
      } else {
        title = `Lock publishing for ${props.docId}`;
      }
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        title,
        innerProps: {...props, ...options},
        size: '600px',
      });
    },
  };
}

/**
 * Formats a millis timestamp for a `datetime-local` input's local time value.
 */
function toLocalDateTimeString(millis: number): string {
  const pad = (n: number) => (n < 10 ? '0' + n : n);
  const d = new Date(millis);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function LockPublishingModal(
  modalProps: ContextModalProps<LockPublishingModalProps>
) {
  const {innerProps: props} = modalProps;
  if (props.unlock) {
    return <LockPublishingModal.Unlock {...modalProps} />;
  }
  return <LockPublishingModal.Lock {...modalProps} />;
}

LockPublishingModal.Lock = (
  modalProps: ContextModalProps<LockPublishingModalProps>
) => {
  const {innerProps: props, context, id} = modalProps;
  const isEdit = Boolean(props.existingLock);
  const [reason, setReason] = useState(props.existingLock?.reason || '');
  const [until, setUntil] = useState(props.existingLock?.until || 0);
  const [loading, setLoading] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const modals = useModals();

  function toTimestamp(datestr: string) {
    if (!datestr) {
      return 0;
    }
    const millis = Math.floor(new Date(datestr).getTime());
    return millis;
  }

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    setLoading(true);
    await notifyErrors(async () => {
      await cmsLockPublishing(props.docId, {reason, until});
      showNotification({
        title: isEdit ? 'Updated!' : 'Locked!',
        message: isEdit
          ? `Publishing lock updated for ${props.docId}.`
          : `Publishing is locked for ${props.docId}.`,
        autoClose: 10000,
      });
      modals.closeModal(id);
      if (props.onChange) {
        props.onChange('locked');
      }
    });
    setLoading(false);
  }

  async function onUnlock() {
    setUnlocking(true);
    await notifyErrors(async () => {
      await cmsUnlockPublishing(props.docId);
      showNotification({
        title: 'Unlocked!',
        message: `Publishing is unlocked for ${props.docId}.`,
        autoClose: 10000,
      });
      modals.closeModal(id);
      if (props.onChange) {
        props.onChange('unlocked');
      }
    });
    setUnlocking(false);
  }

  const bodyText = isEdit
    ? 'Publishing is currently locked. Update the publishing lock details below, or remove the lock to re‑enable publishing.'
    : 'Are you sure you want to lock publishing? Content editors will not be able to publish until publishing is unlocked.';

  return (
    <div className="LockPublishingModal LockPublishingModal--lock">
      <Text className="LockPublishingModal__body" size="body-sm">
        {bodyText}
      </Text>

      <form className="LockPublishingModal__form" onSubmit={(e) => onSubmit(e)}>
        <div className="LockPublishingModal__form__section">
          <TextInput
            name="reason"
            label="Reason"
            description="Specify a short reason so other content editors know why publishing is locked."
            size="xs"
            radius={0}
            value={reason}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
              setReason(e.currentTarget.value);
            }}
          />
        </div>
        <div className="LockPublishingModal__form__section">
          <InputWrapper
            label="Lock until"
            description="Optional. Publishing is unlocked at the specified time. If not provided, publishing will be locked indefinitely."
            size="xs"
          >
            <div className="DocEditor__DateTimeField">
              <input
                name="until"
                type="datetime-local"
                min={getLocalISOString()}
                defaultValue={until ? toLocalDateTimeString(until) : ''}
                onChange={(e: Event) => {
                  const target = e.target as HTMLInputElement;
                  const datestr = target.value;
                  setUntil(toTimestamp(datestr));
                }}
              />
              <div className="DocEditor__DateTimeField__timezone">
                timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
              </div>
            </div>
          </InputWrapper>
        </div>
        <div className="LockPublishingModal__buttons">
          {isEdit && (
            <Button
              variant="filled"
              size="xs"
              color="red"
              type="button"
              leftIcon={<IconLockOpen size={14} />}
              loading={unlocking}
              disabled={loading}
              onClick={() => onUnlock()}
              className="LockPublishingModal__buttons__unlock"
            >
              Unlock
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => context.closeModal(id)}
            type="button"
            size="xs"
            color="dark"
          >
            Cancel
          </Button>
          <Button
            variant="filled"
            size="xs"
            color="dark"
            leftIcon={<IconLock size={14} />}
            disabled={!reason || unlocking}
            type="submit"
            loading={loading}
          >
            {isEdit ? 'Save' : 'Lock'}
          </Button>
        </div>
      </form>
    </div>
  );
};

LockPublishingModal.Unlock = (
  modalProps: ContextModalProps<LockPublishingModalProps>
) => {
  const {innerProps: props, context, id} = modalProps;
  const [loading, setLoading] = useState(false);
  const modals = useModals();

  async function onSubmit() {
    setLoading(true);
    await notifyErrors(async () => {
      await cmsUnlockPublishing(props.docId);
      showNotification({
        title: 'Unlocked!',
        message: `Publishing is unlocked for ${props.docId}.`,
        autoClose: 10000,
      });
      modals.closeModal(id);
      if (props.onChange) {
        props.onChange('unlocked');
      }
    });
  }

  return (
    <div className="LockPublishingModal LockPublishingModal--unlock">
      <Text className="LockPublishingModal__body">
        Are you sure you want to unlock publishing for the following doc? This
        will re-enable content editors to publish the doc.
      </Text>
      <DocIdBadge docId={props.docId} />
      <div className="LockPublishingModal__buttons">
        <Button
          variant="outline"
          onClick={() => context.closeModal(id)}
          type="button"
          size="xs"
          color="dark"
        >
          Cancel
        </Button>
        <Button
          variant="filled"
          size="xs"
          color="dark"
          leftIcon={<IconLockOpen size={14} />}
          loading={loading}
          onClick={() => onSubmit()}
        >
          Unlock
        </Button>
      </div>
    </div>
  );
};

LockPublishingModal.id = MODAL_ID;
