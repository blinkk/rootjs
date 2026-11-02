import {useState} from 'preact/hooks';
import {
  CRON_JOB_LABELS,
  CronJobFailure,
} from '../../../../../shared/cron-status.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {acknowledgeCronFailure, useCronFailures} from '../../cron-failures.js';

/** Lists the background jobs that are failing, for admins to acknowledge. */
export function CronFailures() {
  const failures = useCronFailures();
  if (failures.length === 0) {
    return (
      <div className="CronFailures__empty text-sm text-muted">
        No background jobs are failing.
      </div>
    );
  }
  return (
    <div className="CronFailures flex flex-col gap-2">
      {failures.map((failure) => (
        <CronFailureItem key={failure.job} failure={failure} />
      ))}
    </div>
  );
}

function CronFailureItem(props: {failure: CronJobFailure}) {
  const failure = props.failure;
  const [submitting, setSubmitting] = useState(false);

  async function acknowledge() {
    setSubmitting(true);
    await notifyErrors(() => acknowledgeCronFailure(failure.job));
    setSubmitting(false);
  }

  return (
    <div className="CronFailures__item flex flex-col gap-1.5 rounded-lg border border-solid border-danger-line bg-danger-soft p-3 text-sm">
      <div className="CronFailures__item__title font-semibold text-danger">
        {CRON_JOB_LABELS[failure.job] || failure.job}
      </div>
      <div className="CronFailures__item__message break-words font-mono text-xs">
        {failure.message}
      </div>
      <div className="CronFailures__item__meta text-muted">
        Failing since {new Date(failure.firstFailedAt).toLocaleString()} (
        {failure.failureCount.toLocaleString()}{' '}
        {failure.failureCount === 1 ? 'failure' : 'failures'})
      </div>
      {failure.acknowledgedBy ? (
        <div className="CronFailures__item__acknowledged text-muted">
          Acknowledged by {failure.acknowledgedBy}
        </div>
      ) : (
        <div>
          <Button size="xs" loading={submitting} onClick={acknowledge}>
            Acknowledge
          </Button>
        </div>
      )}
    </div>
  );
}
