import {NumberInput} from '@mantine/core';
import {useCallback, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {useDraftDoc, useDraftDocField} from '../../../hooks/useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

export function NumberField(props: FieldProps) {
  const field = props.field as schema.NumberField;
  const [value, setValue] = useState(field.default || 0);
  const draft = useDraftDoc().controller;

  const onChange = useCallback(
    (newValue: number) => {
      setValue(newValue);
      draft.updateKey(props.deepKey, newValue);
    },
    [props.deepKey]
  );

  useDraftDocField(props.deepKey, (newValue: number) => {
    setValue(newValue);
  });

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
