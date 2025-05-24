import {useEffect, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {
  RichTextEditor,
} from '../../RichTextEditor/RichTextEditor.js';
import {FieldProps} from './FieldProps.js';
import {RichTextData} from '../../../../shared/richtext.js';

export function RichTextField(props: FieldProps) {
  const field = props.field as schema.RichTextField;
  const [value, setValue] = useState<RichTextData | null>(null);

  function onChange(newValue: RichTextData | null) {
    props.draft.updateKey(props.deepKey, newValue);
    setValue(newValue);
  }

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue: RichTextData) => {
        setValue(newValue);
      }
    );
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
