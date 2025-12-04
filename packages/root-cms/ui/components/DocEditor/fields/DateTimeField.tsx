import {Select} from '@mantine/core';
import {formatInTimeZone, fromZonedTime} from 'date-fns-tz';
import {Timestamp} from 'firebase/firestore';
import {useMemo, useState} from 'preact/hooks';
import {DateTimeField as DateTimeFieldSchema} from '../../../core/schema.js';
import {useDraftDocValue} from '../../../hooks/useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

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
      <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
        <input
          type="datetime-local"
          value={dateStr}
          onChange={(e) => {
            const target = e.target as HTMLInputElement;
            onDateChange(target.value, target.validity);
          }}
          style={{flex: 1}}
        />
        {field.timezone ? (
          <div
            className="DocEditor__DateTimeField__timezone"
            style={{marginTop: 0}}
          >
            timezone: {field.timezone}
          </div>
        ) : (
          <Select
            className="DocEditor__DateTimeField__timezoneSelect"
            value={activeTimezone}
            onChange={(val: string | null) => {
              if (val) {
                onTimezoneChange(val);
              }
            }}
            data={Intl.supportedValuesOf('timeZone')}
            searchable
            size="xs"
            style={{width: '180px'}}
          />
        )}
      </div>
      {error && (
        <div style={{color: 'red', fontSize: '12px', marginTop: '4px'}}>
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
