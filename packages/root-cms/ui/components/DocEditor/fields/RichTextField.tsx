import {useEffect, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {RichTextEditor} from '../../RichTextEditor/RichTextEditor.js';
import {FieldProps} from './FieldProps.js';

export function RichTextField(props: FieldProps) {
  const field = props.field as schema.RichTextField;
  const [value, setValue] = useState<string>('');

  function onChange(newValue: string) {
    setValue((currentValue) => {
      if (currentValue !== newValue) {
        props.draft.updateKey(props.deepKey, newValue);
      }
      return newValue;
    });
  }

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(props.deepKey, (newValue: string) => {
      setValue(newValue);
    });
    return unsubscribe;
  }, []);

  return (
    <RichTextEditor
      value={value}
      placeholder={field.placeholder}
      onChange={onChange}
    />
  );
}
