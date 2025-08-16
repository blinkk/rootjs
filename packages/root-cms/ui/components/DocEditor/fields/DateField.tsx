import {useCallback, useEffect, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {FieldProps} from './FieldProps.js';

export function DateField(props: FieldProps) {
  const field = props.field as schema.DateField;
  const [value, setValue] = useState(props.value || field.default || '');

  const onChange = useCallback(
    (newValue: string) => {
      if (newValue) {
        // Value is stored in DB as YYYY-MM-DD string
        props.draft.updateKey(props.deepKey, newValue);
        setValue(newValue);
      } else {
        setValue('');
        props.draft.removeKey(props.deepKey);
      }
      if (props.onChange) {
        props.onChange(newValue);
      }
    },
    [props.deepKey]
  );

  useEffect(() => {
    setValue(props.value || '');
  }, [props.value]);

  return (
    <div className="DocEditor__DateField">
      <input
        type="date"
        value={value}
        onChange={(e: Event) => {
          const target = e.currentTarget as HTMLInputElement;
          onChange(target.value);
        }}
      />
    </div>
  );
}
