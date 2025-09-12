import {FieldProps} from './FieldProps.js';
import {FileField} from './FileField.js';

export function ImageField(props: FieldProps) {
  return <FileField {...props} variant="image" />;
}
