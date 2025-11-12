import {useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {RichTextData} from '../../../../shared/richtext.js';
import {useDraftDoc, useDraftDocField} from '../../../hooks/useDraftDoc.js';
import {RichTextEditor} from '../../RichTextEditor/RichTextEditor.js';
import {FieldProps} from './FieldProps.js';

export function RichTextField(props: FieldProps) {
  const field = props.field as schema.RichTextField;
  const [value, setValue] = useState<RichTextData | null>(null);
  const draft = useDraftDoc().controller;

  const onChange = (newValue: RichTextData | null) => {
    setValue((oldValue: RichTextData | null) => {
      if (oldValue?.time !== newValue?.time) {
        draft.updateKey(props.deepKey, newValue);
      }
      return newValue;
    });
  };

  useDraftDocField(props.deepKey, (newValue: RichTextData) => {
    setValue(newValue);
  });

  return (
    <RichTextEditor
      value={value}
      placeholder={field.placeholder}
      blockComponents={field.blockComponents}
      inlineComponents={field.inlineComponents}
      onChange={onChange}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      autosize={field.autosize}
    />
  );
}
