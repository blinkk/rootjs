import {NumberInput} from '@mantine/core';
import {useCallback} from 'preact/hooks';
import {useDraftDoc} from '../../../hooks/useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

export function NumberField(props: FieldProps) {
  // const field = props.field as schema.NumberField;
  const draft = useDraftDoc();

  const onChange = useCallback(
    (newValue: number) => {
      draft.controller.updateKey(props.deepKey, newValue);
    },
    [props.deepKey]
  );

  return (
    <NumberInput
      size="xs"
      radius={0}
      value={props.value || 0}
      onChange={(value: number) => onChange(value)}
      hideControls
    />
  );
}
