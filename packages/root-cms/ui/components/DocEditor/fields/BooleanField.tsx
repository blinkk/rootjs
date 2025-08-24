import {Checkbox} from '@mantine/core';
import {useCallback, useEffect, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {FieldProps} from './FieldProps.js';

export function BooleanField(props: FieldProps) {
  const field = props.field as schema.BooleanField;
  const label = field.checkboxLabel || 'Enabled';
  const [value, setValue] = useState<boolean>(props.value || false);

  const onChange = useCallback(
    (newValue: boolean) => {
      setValue(newValue);
      props.draft.updateKey(props.deepKey, newValue);
    },
    [props.deepKey]
  );

  useEffect(() => {
    setValue(props.value || false);
  }, [props.value]);

  return (
    <div className="DocEditor__BooleanField">
      <Checkbox
        label={label}
        onChange={(e: Event) => {
          const target = e.currentTarget as HTMLInputElement;
          onChange(target.checked);
        }}
        checked={value}
        size="xs"
      />
    </div>
  );
}
