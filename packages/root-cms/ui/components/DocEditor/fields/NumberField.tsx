import {NumberInput} from '@mantine/core';
import {useEffect, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {FieldProps} from './FieldProps.js';

export function NumberField(props: FieldProps) {
  const field = props.field as schema.NumberField;
  const [value, setValue] = useState(field.default || 0);

  function onChange(newValue: number) {
    setValue(newValue);
    props.draft.updateKey(props.deepKey, newValue);
  }

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue: number) => {
        setValue(newValue);
      }
    );
    return unsubscribe;
  }, []);

  return (
    <NumberInput
      size="xs"
      radius={0}
      value={value}
      onChange={(value: number) => onChange(value)}
      hideControls
    />
  );
}
