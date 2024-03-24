import {useEffect, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {deepEqual} from '../../../utils/objects.js';
import {
  RichTextData,
  RichTextEditor,
} from '../../RichTextEditor/RichTextEditor.js';
import {FieldProps} from './FieldProps.js';

export function RichTextField(props: FieldProps) {
  const field = props.field as schema.RichTextField;
  const [value, setValue] = useState<RichTextData>({
    blocks: [{type: 'paragraph', data: {}}],
  });

  function onChange(newValue: RichTextData) {
    setValue((currentValue) => {
      if (
        !deepEqual({blocks: currentValue?.blocks}, {blocks: newValue?.blocks})
      ) {
        props.draft.updateKey(props.deepKey, newValue);
      }
      return newValue;
    });
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
