import * as schema from '../../../../core/schema.js';

export interface FieldProps {
  field: schema.Field;
  deepKey: string;
  level?: number;
  hideHeader?: boolean;
  onChange?: (newValue: any) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  isArrayChild?: boolean;
}
