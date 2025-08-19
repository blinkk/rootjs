import * as schema from '../../../../core/schema.js';
import {DraftController} from '../../../hooks/useDraft.js';

export interface FieldProps {
  collection: schema.Collection;
  field: schema.Field;
  level?: number;
  hideHeader?: boolean;
  onChange?: (newValue: any) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  shallowKey: string;
  deepKey: string;
  draft: DraftController;
  isArrayChild?: boolean;
}
