import * as schema from '../../../../../../core/schema.js';
import {Checkbox} from '../../../../../primitives/Checkbox/Checkbox.js';
import {useDraftDocValue} from '../../../useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

export function BooleanField(props: FieldProps) {
  const field = props.field as schema.BooleanField;
  const label = field.checkboxLabel || 'Enabled';
  const [value, setValue] = useDraftDocValue(props.deepKey, false);

  return (
    <div className="DocEditor__BooleanField">
      <Checkbox
        label={label}
        color="blue"
        onChange={(e) => setValue(e.currentTarget.checked)}
        checked={!!value}
      />
    </div>
  );
}
