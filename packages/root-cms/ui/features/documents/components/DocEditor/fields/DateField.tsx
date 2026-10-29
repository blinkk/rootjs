import {useState} from 'preact/hooks';
import {TextInput} from '../../../../../primitives/TextInput/TextInput.js';
import {useDraftDocValue} from '../../../useDraftDoc.js';
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
      <TextInput
        type="date"
        classNames={{input: 'rounded-none'}}
        aria-label={props.field.label || props.field.id}
        value={value || ''}
        error={error}
        onChange={(e) => {
          const target = e.currentTarget;
          onDateChange(target.value, target.validity);
        }}
      />
    </div>
  );
}
