import {Select} from '@mantine/core';
import {formatInTimeZone, fromZonedTime} from 'date-fns-tz';
import {Timestamp} from 'firebase/firestore';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {DateTimeField as DateTimeFieldSchema} from '../../../core/schema.js';
import {useDraftDocValue} from '../../../hooks/useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

export function DateTimeField(props: FieldProps) {
  const field = props.field as DateTimeFieldSchema;
  const [value, setValue] = useDraftDocValue<Timestamp | null>(props.deepKey);
  const [timezone, setTimezone] = useState(
    field.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  // Update timezone if field config changes.
  useEffect(() => {
    if (field.timezone) {
      setTimezone(field.timezone);
    }
  }, [field.timezone]);

  const dateStr = useMemo(() => {
    if (!value) {
      return '';
    }
    // value is Timestamp. toDate() gives a Date object (UTC).
    // We want to format it in the selected timezone.
    return formatInTimeZone(value.toDate(), timezone, "yyyy-MM-dd'T'HH:mm");
  }, [value, timezone]);

  const onDateChange = (newDateStr: string) => {
    if (newDateStr) {
      // newDateStr is "YYYY-MM-DDTHH:mm"
      // We interpret this as being in `timezone`.
      const date = fromZonedTime(newDateStr, timezone);
      setValue(Timestamp.fromDate(date));
    } else {
      setValue(null);
    }
  };

  const onTimezoneChange = (newTimezone: string) => {
    setTimezone(newTimezone);
  };

  return (
    <div
      className="DocEditor__DateTimeField"
      style={{display: 'flex', gap: '8px', alignItems: 'center'}}
    >
      <input
        type="datetime-local"
        value={dateStr}
        onChange={(e) => {
          const target = e.target as HTMLInputElement;
          onDateChange(target.value);
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
          value={timezone}
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
  );
}
