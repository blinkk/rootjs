import {Button, InputWrapper, TextInput, Textarea} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {showNotification} from '@mantine/notifications';
import {IconLock, IconLockOpen} from '@tabler/icons-preact';
import {ChangeEvent} from 'preact/compat';
import {useState} from 'preact/hooks';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {cmsLockPublishing, cmsUnlockPublishing} from '../../utils/doc.js';
import {notifyErrors} from '../../utils/notifications.js';
import {getLocalISOString} from '../../utils/time.js';
import {Text} from '../Text/Text.js';

import './LockPublishingModal.css';

const MODAL_ID = 'LockPublishingModal';

export interface LockPublishingModalProps {
  [key: string]: unknown;
  docId: string;
  unlock?: boolean;
  onChange?: (state: 'locked' | 'unlocked') => void;
}

export function useLockPublishingModal(props: LockPublishingModalProps) {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: (options?: Partial<LockPublishingModalProps>) => {
      const modalProps = {...props, ...options};
      const title = modalProps.unlock
        ? `Unlock publishing for ${props.docId}`
        : `Lock publishing for ${props.docId}`;
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        title,
        innerProps: {...props, ...options},
        size: '600px',
      });
    },
  };
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
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState(0);
  const [loading, setLoading] = useState(false);
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
        title: 'Locked!',
        message: `Publishing is locked for ${props.docId}.`,
        autoClose: 10000,
      });
      modals.closeModal(id);
      if (props.onChange) {
        props.onChange('locked');
      }
    });
  }

  return (
    <div className="LockPublishingModal LockPublishingModal--lock">
      <Text className="LockPublishingModal__body">
        Are you sure you want to lock publishing? Content editors will not be
        able to publish until publishing is unlocked.
      </Text>

      <form className="LockPublishingModal__form" onSubmit={(e) => onSubmit(e)}>
        <div className="LockPublishingModal__form__section">
          <TextInput
            name="reason"
            label="Reason"
            description="Specify a short reason so other content editors know why publishing is locked."
            size="xs"
            radius={0}
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
            disabled={!reason}
            type="submit"
            loading={loading}
          >
            Lock
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
        Are you sure you want to unlock publishing for {props.docId}? This will
        re-enable content editors to publish the doc.
      </Text>
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
