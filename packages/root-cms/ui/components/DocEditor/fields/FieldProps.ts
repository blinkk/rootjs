import * as schema from '../../../../core/schema.js';

export interface FieldProps<T = any> {
  field: schema.Field;
  deepKey: string;
  level?: number;
  hideHeader?: boolean;
  value?: T;
  onChange?: (newValue: T) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  isArrayChild?: boolean;
}
