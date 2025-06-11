import * as schema from '../../../../core/schema.js';

export interface FieldProps {
  deepKey: string;
  field: schema.Field;
  hideHeader?: boolean;
}
