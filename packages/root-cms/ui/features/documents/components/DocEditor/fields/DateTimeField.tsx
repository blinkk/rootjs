import {formatInTimeZone, fromZonedTime} from 'date-fns-tz';
import {Timestamp} from 'firebase/firestore';
import {useMemo, useState} from 'preact/hooks';
import {DateTimeField as DateTimeFieldSchema} from '../../../../../../core/schema.js';
import {Select} from '../../../../../primitives/Select/Select.js';
import {TextInput} from '../../../../../primitives/TextInput/TextInput.js';
import {useDraftDocValue} from '../../../useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

/** The IANA timezones the browser supports, for the timezone select. */
const TIMEZONES = Intl.supportedValuesOf('timeZone');

export function DateTimeField(props: FieldProps) {
  const field = props.field as DateTimeFieldSchema;
  const [value, setValue] = useDraftDocValue<Timestamp | null>(props.deepKey);

  // Metadata is stored in a sibling field prefixed with `@`.
  // e.g. if field is `scheduledAt`, metadata is in `@scheduledAt`.
  // Only listen to the timezone key specifically.
  const timezoneKey = `${getMetadataKey(props.deepKey)}.timezone`;
  const [timezone, setTimezone] = useDraftDocValue<string | null>(timezoneKey);

  const activeTimezone =
    field.timezone ||
    timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;

  const dateStr = useMemo(() => {
    if (!value) {
      return '';
    }
    // value is Timestamp. toDate() gives a Date object (UTC).
    // We want to format it in the selected timezone.
    try {
      return formatInTimeZone(
        value.toDate(),
        activeTimezone,
        "yyyy-MM-dd'T'HH:mm"
      );
    } catch (err) {
      console.error('Error formatting date:', err);
      return '';
    }
  }, [value, activeTimezone]);

  const [error, setError] = useState<string | null>(null);

  const onDateChange = (newDateStr: string, validity?: ValidityState) => {
    if (validity && !validity.valid) {
      console.warn('Invalid date input');
      setError('Invalid datetime');
      return;
    }

    if (newDateStr) {
      // newDateStr is "YYYY-MM-DDTHH:mm"
      // We interpret this as being in `timezone`.
      try {
        const date = fromZonedTime(newDateStr, activeTimezone);
        // Check if date is valid
        if (isNaN(date.getTime())) {
          console.warn('Invalid date:', newDateStr);
          setError('Invalid datetime');
          return;
        }
        setError(null);
        setValue(Timestamp.fromDate(date));
      } catch (err) {
        console.error('Error parsing date:', err);
        setError('Invalid datetime');
      }
    } else {
      setError(null);
      setValue(null);
    }
  };

  const onTimezoneChange = (newTimezone: string) => {
    setTimezone(newTimezone);
  };

  return (
    <div className="DocEditor__DateTimeField">
      <div className="DocEditor__DateTimeField__row flex flex-wrap items-center gap-x-2 gap-y-1">
        <TextInput
          type="datetime-local"
          aria-label="Date and time"
          value={dateStr}
          onChange={(e) => {
            const target = e.currentTarget;
            onDateChange(target.value, target.validity);
          }}
          className="DocEditor__DateTimeField__input min-w-50 flex-1"
          inputClassName="rounded-none"
        />
        {field.timezone ? (
          <div className="DocEditor__DateTimeField__timezone text-right text-xs font-normal">
            timezone: {field.timezone}
          </div>
        ) : (
          <Select
            className="DocEditor__DateTimeField__timezoneSelect w-45"
            aria-label="Timezone"
            value={activeTimezone}
            onValueChange={(val) => {
              if (val) {
                onTimezoneChange(val);
              }
            }}
            data={TIMEZONES}
            searchable
          />
        )}
      </div>
      {error && (
        <div className="DocEditor__DateTimeField__error mt-1 text-sm text-danger">
          {error}
        </div>
      )}
    </div>
  );
}

function getMetadataKey(key: string) {
  const parts = key.split('.');
  const last = parts.pop();
  return [...parts, `@${last}`].join('.');
}
