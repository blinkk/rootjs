import {Field, Schema, StringField} from '../schema.js';
import {useSignal, useSignalEffect} from '@preact/signals';
import {useRef} from 'preact/hooks';

export interface EditorProps {
  schema: Schema;
}

export function Editor(props: EditorProps) {
  const data = useSignal({});
  useSignalEffect(() => {
    console.log('data changed: ', data);
  });

  return (
    <div className="editor">
      <div className="editor__fields">
        {props.schema.fields.map((field) => {
          return (
            <Editor.Field
              field={field}
              value={data.value[field.id!]}
              setValue={(value) => (data.value[field.id!] = value)}
            />
          );
        })}
      </div>
    </div>
  );
}

export interface EditorFieldProps<T = Field> {
  field: T;
  value: any;
  setValue: (value: any) => void;
}

Editor.Field = (props: EditorFieldProps) => {
  const field = props.field;
  if (field.type === 'string') {
    return <Editor.StringField {...props} field={props.field as StringField} />;
  }
  return <div>Unsupported field type: {field.type}</div>;
};

Editor.StringField = (props: EditorFieldProps<StringField>) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChange = () => {
    const value = inputRef.current!.value;
    props.setValue(value);
  };
  return (
    <div class="StringField">
      <input
        ref={inputRef}
        type="string"
        onChange={() => onChange()}
        value={props.value || props.field.default || ''}
      />
    </div>
  );
};
