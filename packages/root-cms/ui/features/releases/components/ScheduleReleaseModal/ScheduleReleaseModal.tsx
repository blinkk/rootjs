import {Timestamp} from 'firebase/firestore';
import {useState, useRef} from 'preact/hooks';
import {Button} from '../../../../primitives/Button/Button.js';
import {
  type ContextModalProps,
  useModals,
} from '../../../../primitives/modals/ModalsProvider.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {getLocalISOString} from '../../../../utils/time.js';
import {scheduleRelease} from '../../release.js';
import {usePublishChecks} from '../../usePublishChecks.js';
import {SCHEDULE_RELEASE_MODAL_ID} from './useScheduleReleaseModal.js';

export type PublishType = 'now' | 'scheduled' | '';

export interface ScheduleReleaseModalProps {
  [key: string]: unknown;
  releaseId: string;
  /**
   * Docs in the release. Used to run the publishing checks configured on each
   * doc's collection before the release is scheduled.
   */
  docIds?: string[];
  /** Whether an admin opted to skip the publishing checks. */
  skipChecks?: boolean;
  onScheduled?: (scheduledAt: Timestamp) => void;
}

export function ScheduleReleaseModal(
  modalProps: ContextModalProps<ScheduleReleaseModalProps>
) {
  const {innerProps: props, context, id} = modalProps;
  const [scheduledDate, setScheduledDate] = useState('');
  const [loading, setLoading] = useState(false);
  const dateTimeRef = useRef<HTMLInputElement>(null);
  const modals = useModals();
  const publishChecks = usePublishChecks();

  async function schedule() {
    setLoading(true);
    await notifyErrors(async () => {
      const millis = Math.floor(new Date(scheduledDate).getTime());
      const now = Math.floor(new Date().getTime());
      if (now >= millis) {
        throw new Error('bad datetime, please choose a date in the future');
      }
      // Checks run when the release is scheduled, not when it goes live.
      const decision = await publishChecks.run({
        docIds: props.docIds || [],
        actionLabel: 'Schedule',
        skip: props.skipChecks,
      });
      if (!decision.proceed) {
        return;
      }
      const timestamp = Timestamp.fromMillis(millis);
      await scheduleRelease(props.releaseId, millis, {
        checksAudit: decision.audit || undefined,
      });
      showNotification({
        title: 'Scheduled!',
        message: `Release ${props.releaseId} will go live ${scheduledDate}.`,
        autoClose: 10000,
      });
      modals.closeAll();
      if (props.onScheduled) {
        props.onScheduled(timestamp);
      }
      // Opened after `closeAll()` so the warnings aren't closed along with the
      // schedule modal.
      publishChecks.showWarnings(decision.results, {actionLabel: 'Schedule'});
    });
    setLoading(false);
  }

  return (
    <div className="ScheduleReleaseModal">
      <form
        className="ScheduleReleaseModal__form flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          schedule();
        }}
      >
        <div className="ScheduleReleaseModal__description text-sm leading-normal text-fg">
          Content in the release will go live at the datetime specified below.
        </div>
        <div className="ScheduleReleaseModal__dateInput flex flex-col gap-1">
          <TextInput
            ref={dateTimeRef}
            type="datetime-local"
            aria-label="Go-live date and time"
            value={scheduledDate}
            min={getLocalISOString()}
            onChange={(e: Event) => {
              const target = e.target as HTMLInputElement;
              setScheduledDate(target.value);
            }}
          />
          <div className="ScheduleReleaseModal__timezone text-right text-xs text-muted">
            timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </div>
        </div>
        <div className="ScheduleReleaseModal__buttons mt-2 flex justify-end gap-3">
          <Button onClick={() => context.closeModal(id)}>Cancel</Button>
          <Button variant="primary" loading={loading} type="submit">
            Schedule
          </Button>
        </div>
      </form>
    </div>
  );
}

ScheduleReleaseModal.id = SCHEDULE_RELEASE_MODAL_ID;
