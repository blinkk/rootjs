import {Timestamp} from 'firebase/firestore';
import {useEffect, useState} from 'preact/hooks';
import {FieldProps} from './FieldProps.js';

export function DateTimeField(props: FieldProps) {
  // const field = props.field as schema.DateTimeField;
  const [dateStr, setDateStr] = useState('');

  function onChange(newDateStr: string) {
    if (newDateStr) {
      const millis = Math.floor(new Date(newDateStr).getTime());
      const newValue = Timestamp.fromMillis(millis);
      setDateStr(toDateStr(newValue));
      props.draft.updateKey(props.deepKey, newValue);
    } else {
      setDateStr('');
      props.draft.removeKey(props.deepKey);
    }
  }

  function toDateStr(ts: Timestamp) {
    const date = ts.toDate();
    // Subtract by the timezone offset so that toISOString() returns the local
    // datetime string.
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue: Timestamp) => {
        if (newValue) {
          setDateStr(toDateStr(newValue));
        } else {
          setDateStr('');
        }
      }
    );
    return unsubscribe;
  }, []);

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
