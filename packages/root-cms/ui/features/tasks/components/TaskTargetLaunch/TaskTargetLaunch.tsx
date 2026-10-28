import './TaskTargetLaunch.css';

import {Button, SegmentedControl} from '@mantine/core';
import {
  IconBolt,
  IconCalendar,
  IconClock,
  IconInfinity,
} from '@tabler/icons-preact';
import {joinClassNames} from '../../../../utils/classes.js';
import {
  formatTaskTargetLaunch,
  TaskTargetLaunch,
  TaskTargetLaunchInput,
  TaskTargetLaunchType,
} from '../../tasks.js';

const TARGET_LAUNCH_TYPE_OPTIONS: Array<{
  value: TaskTargetLaunchType;
  label: string;
}> = [
  {value: 'anytime', label: 'Anytime'},
  {value: 'asap', label: 'ASAP'},
  {value: 'date', label: 'Date'},
  {value: 'datetime', label: 'Date & time'},
];

/** Editable form state for the picker. */
export interface TaskTargetLaunchDraft {
  type: TaskTargetLaunchType;
  /** `YYYY-MM-DD`, as used by `<input type="date">`. */
  date: string;
  /** `HH:mm`, as used by `<input type="time">`. */
  time: string;
}

/** Returns a draft for the picker, defaulting to an empty `date`. */
export function toTaskTargetLaunchDraft(
  launch: TaskTargetLaunch | null
): TaskTargetLaunchDraft {
  if (!launch) {
    return {type: 'date', date: '', time: ''};
  }
  if (!launch.date) {
    return {type: launch.type, date: '', time: ''};
  }
  const date = new Date(launch.date.toMillis());
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    type: launch.type,
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time:
      launch.type === 'datetime'
        ? `${pad(date.getHours())}:${pad(date.getMinutes())}`
        : '',
  };
}

/**
 * Converts a draft to a value that can be saved, or returns null if the draft
 * is missing a required date or time.
 */
export function parseTaskTargetLaunchDraft(
  draft: TaskTargetLaunchDraft
): TaskTargetLaunchInput | null {
  if (draft.type === 'anytime' || draft.type === 'asap') {
    return {type: draft.type, date: null};
  }
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(draft.date);
  if (!dateMatch) {
    return null;
  }
  const [year, month, day] = dateMatch.slice(1).map(Number);
  if (draft.type === 'date') {
    return {type: 'date', date: new Date(year, month - 1, day)};
  }
  const timeMatch = /^(\d{2}):(\d{2})/.exec(draft.time);
  if (!timeMatch) {
    return null;
  }
  const [hours, minutes] = timeMatch.slice(1).map(Number);
  return {
    type: 'datetime',
    date: new Date(year, month - 1, day, hours, minutes),
  };
}

export interface TaskTargetLaunchPickerProps {
  value: TaskTargetLaunchDraft;
  onChange: (value: TaskTargetLaunchDraft) => void;
  onClear: () => void;
  /** Called when "Done" is clicked. Disabled until the draft is complete. */
  onDone: () => void;
}

/**
 * Popover body for choosing a target launch: a type switcher (anytime, ASAP,
 * date, or date & time) plus the date/time inputs the chosen type needs.
 */
export function TaskTargetLaunchPicker(props: TaskTargetLaunchPickerProps) {
  const {value} = props;
  const complete = parseTaskTargetLaunchDraft(value) !== null;

  function update(changes: Partial<TaskTargetLaunchDraft>) {
    props.onChange({...value, ...changes});
  }

  return (
    <div className="TaskTargetLaunch__picker">
      <SegmentedControl
        className="TaskTargetLaunch__picker__types"
        size="xs"
        fullWidth
        value={value.type}
        data={TARGET_LAUNCH_TYPE_OPTIONS}
        onChange={(type: TaskTargetLaunchType) => update({type})}
      />
      {value.type === 'anytime' && (
        <p className="TaskTargetLaunch__picker__note">
          No deadline. Launch whenever it's ready.
        </p>
      )}
      {value.type === 'asap' && (
        <p className="TaskTargetLaunch__picker__note">
          Urgent. Launch as soon as possible.
        </p>
      )}
      {(value.type === 'date' || value.type === 'datetime') && (
        <div
          className={joinClassNames(
            'TaskTargetLaunch__picker__fields',
            value.type === 'datetime' &&
              'TaskTargetLaunch__picker__fields--datetime'
          )}
        >
          <label className="TaskTargetLaunch__picker__field">
            Date
            <input
              type="date"
              value={value.date}
              onInput={(e) =>
                update({date: (e.currentTarget as HTMLInputElement).value})
              }
            />
          </label>
          {value.type === 'datetime' && (
            <label className="TaskTargetLaunch__picker__field">
              Time
              <input
                type="time"
                value={value.time}
                onInput={(e) =>
                  update({time: (e.currentTarget as HTMLInputElement).value})
                }
              />
            </label>
          )}
        </div>
      )}
      {value.type === 'datetime' && (
        <p className="TaskTargetLaunch__picker__note">
          In your time zone ({getTimeZoneName()}).
        </p>
      )}
      <div className="TaskTargetLaunch__picker__actions">
        <Button compact size="xs" variant="default" onClick={props.onClear}>
          Clear
        </Button>
        <Button
          compact
          size="xs"
          color="dark"
          disabled={!complete}
          onClick={props.onDone}
        >
          Done
        </Button>
      </div>
    </div>
  );
}

export interface TaskTargetLaunchLabelProps {
  launch: TaskTargetLaunch | null;
  /** Drops the year and shows "Today" for today's date. */
  short?: boolean;
  /** Shows an icon before dates and "Anytime". */
  withIcon?: boolean;
  /** Renders the date in red. */
  overdue?: boolean;
}

/**
 * Displays a target launch: a red pill for ASAP, otherwise the formatted
 * date (or "Anytime").
 */
export function TaskTargetLaunchLabel(props: TaskTargetLaunchLabelProps) {
  const {launch} = props;
  if (launch?.type === 'asap') {
    return (
      <span className="TaskTargetLaunch__asap">
        <IconBolt size={11} strokeWidth="2.4" />
        ASAP
      </span>
    );
  }
  const Icon =
    launch?.type === 'anytime'
      ? IconInfinity
      : launch?.type === 'datetime'
        ? IconClock
        : IconCalendar;
  return (
    <span
      className={joinClassNames(
        'TaskTargetLaunch__label',
        launch?.type === 'anytime' && 'TaskTargetLaunch__label--anytime',
        props.overdue && 'TaskTargetLaunch__label--overdue'
      )}
    >
      {props.withIcon && launch && (
        <Icon
          className="TaskTargetLaunch__label__icon"
          size={15}
          strokeWidth="1.8"
        />
      )}
      {formatTaskTargetLaunch(launch, {short: props.short})}
    </span>
  );
}

/**
 * Returns a short description of when a target launch is relative to now,
 * e.g. "In 18 days", "Today", or "Overdue by 2 days".
 */
export function formatTaskTargetLaunchRelative(
  launch: TaskTargetLaunch | null,
  options: {overdue: boolean}
) {
  if (!launch) {
    return '';
  }
  if (launch.type === 'anytime') {
    return 'No deadline';
  }
  if (launch.type === 'asap') {
    return 'As soon as possible';
  }
  const target = new Date(launch.date!.toMillis());
  const now = new Date();
  if (options.overdue) {
    const hours = Math.floor((now.getTime() - target.getTime()) / 3600000);
    if (launch.type === 'datetime' && hours < 24) {
      return hours < 1 ? 'Overdue' : `Overdue by ${pluralize(hours, 'hour')}`;
    }
    const days = Math.max(1, daysBetween(target, now));
    return `Overdue by ${pluralize(days, 'day')}`;
  }
  const days = daysBetween(now, target);
  if (days < 0) {
    return '';
  }
  const when =
    days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
  return launch.type === 'datetime' ? `${when} · ${getTimeZoneName()}` : when;
}

/** Returns the number of calendar days from `a` to `b`. */
function daysBetween(a: Date, b: Date) {
  const start = new Date(a);
  start.setHours(0, 0, 0, 0);
  const end = new Date(b);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Returns the user's short time zone name, e.g. "PST". */
function getTimeZoneName() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZoneName: 'short',
  }).formatToParts(new Date());
  return parts.find((part) => part.type === 'timeZoneName')?.value || 'local';
}
