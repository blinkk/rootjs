import {useCallback, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {useDraftDoc, useDraftDocField} from '../../../hooks/useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

export function DateField(props: FieldProps) {
  const field = props.field as schema.DateField;
  const [value, setValue] = useState(field.default || '');
  const draft = useDraftDoc().controller;

  const onChange = useCallback(
    (newValue: string) => {
      if (newValue) {
        // Value is stored in DB as YYYY-MM-DD string
        draft.updateKey(props.deepKey, newValue);
        setValue(newValue);
      } else {
        draft.removeKey(props.deepKey);
        setValue('');
      }
      if (props.onChange) {
        props.onChange(newValue);
      }
    },
    [props.deepKey]
  );

  useDraftDocField(props.deepKey, (newVal: string) => {
    setValue(newVal || '');
  });

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
