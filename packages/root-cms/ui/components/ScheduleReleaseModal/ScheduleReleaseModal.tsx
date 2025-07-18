import {Button} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {showNotification} from '@mantine/notifications';
import {Timestamp} from 'firebase/firestore';
import {useState, useRef} from 'preact/hooks';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {notifyErrors} from '../../utils/notifications.js';
import {scheduleRelease} from '../../utils/release.js';
import {getLocalISOString} from '../../utils/time.js';

import './ScheduleReleaseModal.css';

const MODAL_ID = 'ScheduleReleaseModal';

export type PublishType = 'now' | 'scheduled' | '';

export interface ScheduleReleaseModalProps {
  [key: string]: unknown;
  releaseId: string;
  onScheduled?: (scheduledAt: Timestamp) => void;
}

export function useScheduleReleaseModal(props: ScheduleReleaseModalProps) {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: () => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        title: `Schedule release: ${props.releaseId}`,
        innerProps: props,
      });
    },
  };
}

export function ScheduleReleaseModal(
  modalProps: ContextModalProps<ScheduleReleaseModalProps>
) {
  const {innerProps: props, context, id} = modalProps;
  const [scheduledDate, setScheduledDate] = useState('');
  const [loading, setLoading] = useState(false);
  const dateTimeRef = useRef<HTMLInputElement>(null);
  const modals = useModals();

  async function schedule() {
    setLoading(true);
    await notifyErrors(async () => {
      const millis = Math.floor(new Date(scheduledDate).getTime());
      const now = Math.floor(new Date().getTime());
      if (now >= millis) {
        throw new Error('bad datetime, please choose a date in the future');
      }
      const timestamp = Timestamp.fromMillis(millis);
      await scheduleRelease(props.releaseId, millis);
      showNotification({
        title: 'Scheduled!',
        message: `Release ${props.releaseId} will go live ${scheduledDate}.`,
        autoClose: 10000,
      });
      modals.closeAll();
      if (props.onScheduled) {
        props.onScheduled(timestamp);
      }
    });
    setLoading(false);
  }

  return (
    <div className="ScheduleReleaseModal">
      <div className="ScheduleReleaseModal__content">
        <form
          className="ScheduleReleaseModal__form"
          onSubmit={(e) => {
            e.preventDefault();
            schedule();
          }}
        >
          <div className="ScheduleReleaseModal__form__description">
            Content in the release will go live at the datetime specified below.
          </div>
          <div className="ScheduleReleaseModal__form__dateInput">
            <input
              ref={dateTimeRef}
              type="datetime-local"
              value={scheduledDate}
              min={getLocalISOString()}
              onChange={(e: Event) => {
                const target = e.target as HTMLInputElement;
                setScheduledDate(target.value);
              }}
            />
            <div className="ScheduleReleaseModal__form__dateInput__help">
              timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </div>
          </div>
          <div className="ScheduleReleaseModal__form__buttons">
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
              loading={loading}
              type="submit"
            >
              Schedule
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

ScheduleReleaseModal.id = MODAL_ID;
