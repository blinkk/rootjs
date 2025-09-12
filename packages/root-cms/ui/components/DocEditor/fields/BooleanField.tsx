import {Checkbox} from '@mantine/core';
import * as schema from '../../../../core/schema.js';
import {useDraftDocValue} from '../../../hooks/useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

export function BooleanField(props: FieldProps) {
  const field = props.field as schema.BooleanField;
  const label = field.checkboxLabel || 'Enabled';
  const [value, setValue] = useDraftDocValue(props.deepKey, false);

  return (
    <div className="DocEditor__BooleanField">
      <Checkbox
        label={label}
        onChange={(e: Event) => {
          const target = e.currentTarget as HTMLInputElement;
          setValue(target.checked);
        }}
        checked={value}
        size="xs"
      />
    </div>
  );
}
