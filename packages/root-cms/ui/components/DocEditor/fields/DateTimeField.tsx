import {Timestamp} from 'firebase/firestore';
import {useCallback, useMemo} from 'preact/hooks';
import {useDraftDoc} from '../../../hooks/useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

export function DateTimeField(props: FieldProps) {
  // const field = props.field as schema.DateTimeField;
  const draft = useDraftDoc();
  const dateStr = useMemo(() => {
    if (!props.value) {
      return '';
    }
    return toDateStr(props.value);
  }, [props.value]);

  const onChange = useCallback(
    (e: Event) => {
      const target = e.target as HTMLInputElement;
      const newDateStr = target.value;
      if (newDateStr) {
        const millis = Math.floor(new Date(newDateStr).getTime());
        const newValue = Timestamp.fromMillis(millis);
        draft.controller.updateKey(props.deepKey, newValue);
      } else {
        draft.controller.removeKey(props.deepKey);
      }
    },
    [props.deepKey]
  );

  return (
    <div className="DocEditor__DateTimeField">
      <input type="datetime-local" value={dateStr} onChange={onChange} />
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
