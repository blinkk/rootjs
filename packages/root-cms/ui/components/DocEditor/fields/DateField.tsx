import {useDraftDocValue} from '../../../hooks/useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

export function DateField(props: FieldProps) {
  const [value, setValue] = useDraftDocValue<string | null>(props.deepKey);

  return (
    <div className="DocEditor__DateField">
      <input
        type="date"
        value={value || ''}
        onChange={(e: Event) => {
          const target = e.currentTarget as HTMLInputElement;
          setValue(target.value || null);
        }}
      />
    </div>
  );
}
