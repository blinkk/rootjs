import {IconLock, IconLockOpen} from '@tabler/icons-preact';
import {ChangeEvent} from 'preact/compat';
import {useState} from 'preact/hooks';
import {Text} from '../../../../components/Text/Text.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {
  type ContextModalProps,
  useModals,
} from '../../../../primitives/modals/ModalsProvider.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {getLocalISOString} from '../../../../utils/time.js';
import {DocIdBadge} from '../../../documents/components/DocIdBadge/DocIdBadge.js';
import {
  cmsLockPublishing,
  cmsUnlockPublishing,
} from '../../../documents/doc.js';
import {LOCK_PUBLISHING_MODAL_ID} from './useLockPublishingModal.js';

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
      <Text className="LockPublishingModal__body text-pretty" size="body-sm">
        {bodyText}
      </Text>

      <form
        className="LockPublishingModal__form mt-4 flex flex-col gap-4"
        onSubmit={(e) => onSubmit(e)}
      >
        <TextInput
          className="LockPublishingModal__reason"
          name="reason"
          label="Reason"
          description="Specify a short reason so other content editors know why publishing is locked."
          value={reason}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setReason(e.currentTarget.value);
          }}
        />
        <div className="LockPublishingModal__until flex flex-col gap-1">
          <TextInput
            name="until"
            type="datetime-local"
            label="Lock until"
            description="Optional. Publishing is unlocked at the specified time. If not provided, publishing will be locked indefinitely."
            min={getLocalISOString()}
            defaultValue={until ? toLocalDateTimeString(until) : ''}
            onChange={(e: Event) => {
              const target = e.target as HTMLInputElement;
              const datestr = target.value;
              setUntil(toTimestamp(datestr));
            }}
          />
          <div className="LockPublishingModal__timezone text-right text-xs text-muted">
            timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </div>
        </div>
        <div className="LockPublishingModal__buttons mt-1 flex flex-wrap justify-end gap-3">
          {isEdit && (
            <Button
              variant="danger"
              icon={<IconLockOpen />}
              loading={unlocking}
              disabled={loading}
              onClick={() => onUnlock()}
              className="LockPublishingModal__unlock mr-auto"
            >
              Unlock
            </Button>
          )}
          <Button onClick={() => context.closeModal(id)}>Cancel</Button>
          <Button
            variant="primary"
            icon={<IconLock />}
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
    <div className="LockPublishingModal LockPublishingModal--unlock flex flex-col items-start gap-3">
      <Text className="LockPublishingModal__body text-pretty">
        Are you sure you want to unlock publishing for the following doc? This
        will re-enable content editors to publish the doc.
      </Text>
      <DocIdBadge docId={props.docId} />
      <div className="LockPublishingModal__buttons mt-2 flex w-full justify-end gap-3">
        <Button onClick={() => context.closeModal(id)}>Cancel</Button>
        <Button
          variant="primary"
          icon={<IconLockOpen />}
          loading={loading}
          onClick={() => onSubmit()}
        >
          Unlock
        </Button>
      </div>
    </div>
  );
};

LockPublishingModal.id = LOCK_PUBLISHING_MODAL_ID;
