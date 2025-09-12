import {NumberInput} from '@mantine/core';
import {useDraftDocValue} from '../../../hooks/useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

export function NumberField(props: FieldProps) {
  const [value, setValue] = useDraftDocValue(props.deepKey, 0);
  return (
    <NumberInput
      size="xs"
      radius={0}
      value={value}
      onChange={(value: number) => setValue(value)}
      hideControls
    />
  );
}
