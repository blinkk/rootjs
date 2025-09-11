import {Timestamp} from 'firebase/firestore';
import {useCallback, useState} from 'preact/hooks';
import {useDraftDoc, useDraftDocField} from '../../../hooks/useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

export function DateTimeField(props: FieldProps) {
  // const field = props.field as schema.DateTimeField;
  const [dateStr, setDateStr] = useState('');
  const draft = useDraftDoc().controller;

  const onChange = useCallback(
    (newDateStr: string) => {
      if (newDateStr) {
        const millis = Math.floor(new Date(newDateStr).getTime());
        const newValue = Timestamp.fromMillis(millis);
        setDateStr(toDateStr(newValue));
        draft.updateKey(props.deepKey, newValue);
      } else {
        setDateStr('');
        draft.removeKey(props.deepKey);
      }
    },
    [props.deepKey]
  );

  useDraftDocField(props.deepKey, (newValue: Timestamp) => {
    if (newValue) {
      setDateStr(toDateStr(newValue));
    } else {
      setDateStr('');
    }
  });

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
  const date = ts.toDate();
  // Subtract by the timezone offset so that toISOString() returns the local
  // datetime string.
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}
