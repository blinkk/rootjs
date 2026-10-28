import {NumberInput} from '../../../../../primitives/NumberInput/NumberInput.js';
import {useDraftDocValue} from '../../../useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

export function NumberField(props: FieldProps) {
  const [value, setValue] = useDraftDocValue<number | undefined>(
    props.deepKey,
    0
  );
  return (
    <NumberInput
      className="DocEditor__NumberField"
      classNames={{input: 'rounded-none'}}
      aria-label={props.field.label || props.field.id}
      value={value}
      onValueChange={(value) => setValue(value)}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      hideControls
    />
  );
}
