import {Checkbox} from '@mantine/core';
import * as schema from '../../../../core/schema.js';
import {useDraftDoc} from '../../../hooks/useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

export function BooleanField(props: FieldProps) {
  const field = props.field as schema.BooleanField;
  const label = field.checkboxLabel || 'Enabled';
  const draft = useDraftDoc();

  return (
    <div className="DocEditor__BooleanField">
      <Checkbox
        label={label}
        onChange={(e: Event) => {
          const target = e.currentTarget as HTMLInputElement;
          const value = target.checked;
          draft.controller.updateKey(props.deepKey, value);
        }}
        checked={!!props.value}
        size="xs"
      />
    </div>
  );
}
