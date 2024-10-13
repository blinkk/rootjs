import {Checkbox} from '@mantine/core';
import {useEffect, useState} from 'preact/hooks';
import {FieldProps} from './FieldProps.js';
import * as schema from '@/../core/schema.js';

export function BooleanField(props: FieldProps) {
  const field = props.field as schema.BooleanField;
  const label = field.checkboxLabel || 'Enabled';
  const [value, setValue] = useState<boolean>(false);

  function onChange(newValue: boolean) {
    setValue(newValue);
    props.draft.updateKey(props.deepKey, newValue);
  }

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue: boolean) => {
        setValue(newValue);
      }
    );
    return unsubscribe;
  }, []);

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
