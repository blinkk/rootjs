import {useState} from 'preact/hooks';
import {useDraftDocValue} from '../../../hooks/useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

export function DateField(props: FieldProps) {
  const [value, setValue] = useDraftDocValue<string | null>(props.deepKey);

  const [error, setError] = useState<string | null>(null);

  const onDateChange = (newValue: string, validity?: ValidityState) => {
    if (validity && !validity.valid) {
      setError('Invalid date');
      return;
    }

    if (newValue) {
      const date = new Date(newValue);
      if (isNaN(date.getTime())) {
        setError('Invalid date');
        return;
      }
      setError(null);
      setValue(newValue);
    } else {
      setError(null);
      setValue(null);
    }
  };

  return (
    <div className="DocEditor__DateField">
      <input
        type="date"
        value={value || ''}
        onChange={(e: Event) => {
          const target = e.currentTarget as HTMLInputElement;
          onDateChange(target.value, target.validity);
        }}
      />
      {error && (
        <div style={{color: 'red', fontSize: '12px', marginTop: '4px'}}>
          {error}
        </div>
      )}
    </div>
  );
}
