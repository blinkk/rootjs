import {useDraftDoc} from '../../../hooks/useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

export function DateField(props: FieldProps) {
  // const field = props.field as schema.DateField;
  const draft = useDraftDoc();
  return (
    <div className="DocEditor__DateField">
      <input
        type="date"
        value={props.value || ''}
        onChange={(e: Event) => {
          const target = e.currentTarget as HTMLInputElement;
          const value = target.value;
          if (value) {
            draft.controller.updateKey(props.deepKey, value);
          } else {
            draft.controller.removeKey(props.deepKey);
          }
        }}
      />
    </div>
  );
}
