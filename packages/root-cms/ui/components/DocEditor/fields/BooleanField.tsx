import {Checkbox} from '@mantine/core';
import {useCallback, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {useDraftDoc, useDraftDocField} from '../../../hooks/useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

export function BooleanField(props: FieldProps) {
  const field = props.field as schema.BooleanField;
  const label = field.checkboxLabel || 'Enabled';
  const [value, setValue] = useState<boolean>(false);
  const draft = useDraftDoc().controller;

  const onChange = useCallback(
    (newValue: boolean) => {
      setValue(newValue);
      draft.updateKey(props.deepKey, newValue);
    },
    [props.deepKey]
  );

  useDraftDocField(props.deepKey, (newValue: boolean) => {
    setValue(!!newValue);
  });

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
