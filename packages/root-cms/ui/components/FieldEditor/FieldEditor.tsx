import * as schema from '../../../core/schema.js';
import {joinClassNames} from '../../utils/classes.js';
import {StringField} from './fields/StringField.js';
import {FieldEditorProvider} from './hooks/useFieldEditor.js';
import './FieldEditor.css';
import {FieldProps} from './fields/Field.js';

export interface FieldEditorProps<ValueType = any> {
  className?: string;
  schema: schema.Schema;
  onChange?: (value: ValueType) => void;
  value?: ValueType;
}

/**
 * Component that renders an editor for fields from a schema.ts object.
 */
export function FieldEditor(props: FieldEditorProps) {
  const fields = (props.schema.fields || []).filter((field) => !!field.id);
  return (
    <FieldEditorProvider value={props.value} onChange={props.onChange}>
      <div className={joinClassNames(props.className, 'FieldEditor')}>
        {fields.map((field) => (
          <Field field={field} deepKey={field.id!} />
        ))}
      </div>
    </FieldEditorProvider>
  );
}

function Field(props: FieldProps) {
  const field = props.field;
  if (!field.id) {
    console.warn('missing id for field:');
    console.warn(field);
    return null;
  }

  const showFieldHeader = !props.hideHeader;

  return (
    <div className="FieldEditor__Field" data-deepkey={props.deepKey}>
      {showFieldHeader && (
        <FieldHeader {...props} />
      )}
      <div className="FieldEditor__Field__input">
        {field.type === 'string' ? (
          <StringField {...props} />
        ) : (
          <div className="FieldEditor__Field__unknown">
            Unknown field type: {field.type}
          </div>
        )}
      </div>
    </div>
  );
}

function FieldHeader(props: FieldProps & {className?: string}) {
  const field = props.field;
  return (
    <div className={joinClassNames(props.className, 'FieldEditor__FieldHeader')}>
      {field.deprecated ? (
        <div className="FieldEditor__FieldHeader__label">
          DEPRECATED: {field.label}
        </div>
      ) : (
        <div className="FieldEditor__FieldHeader__label">
          <span>{field.label}</span>
        </div>
      )}
      {field.help && (
        <div className="FieldEditor__FieldHeader__help">{field.help}</div>
      )}
    </div>
  );
}
