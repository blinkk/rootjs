import * as schema from '../../../../core/schema.js';
import {FieldProps} from './FieldProps.js';
import {FileField} from './FileField.js';

export function ImageField(props: FieldProps) {
  return (
    <FileField
      {...props}
      field={props.field as schema.FileField}
      variant="image"
    />
  );
}
