import {Timestamp} from 'firebase/firestore';
import {useMemo} from 'preact/hooks';
import {useDraftDocValue} from '../../../hooks/useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

export function DateTimeField(props: FieldProps) {
  const [value, setValue] = useDraftDocValue<Timestamp | null>(props.deepKey);

  const dateStr = useMemo(() => {
    if (!value) {
      return '';
    }
    return toDateStr(value);
  }, [value]);

  const onChange = (newDateStr: string) => {
    if (newDateStr) {
      const millis = Math.floor(new Date(newDateStr).getTime());
      const newValue = Timestamp.fromMillis(millis);
      setValue(newValue);
    } else {
      setValue(null);
    }
  };

  return (
    <div className="DocEditor__DateTimeField">
      <input
        type="datetime-local"
        value={dateStr}
        onChange={(e: Event) => {
          const target = e.target as HTMLInputElement;
          const newDateStr = target.value;
          onChange(newDateStr);
        }}
      />
      <div className="DocEditor__DateTimeField__timezone">
        timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
      </div>
    </div>
  );
}

function toDateStr(ts: Timestamp) {
  try {
    const date = ts.toDate();
    // Subtract by the timezone offset so that toISOString() returns the local
    // datetime string.
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  } catch (err) {
    console.error('failed to parse date: ', ts);
    return '';
  }
}
