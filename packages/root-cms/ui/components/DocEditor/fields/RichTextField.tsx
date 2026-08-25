import {useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {
  RichTextData,
  testSameRichTextContent,
} from '../../../../shared/richtext.js';
import {useDraftDoc, useDraftDocField} from '../../../hooks/useDraftDoc.js';
import {RichTextEditor} from '../../RichTextEditor/RichTextEditor.js';
import {FieldProps} from './FieldProps.js';

export function RichTextField(props: FieldProps) {
  const field = props.field as schema.RichTextField;
  const [value, setValue] = useState<RichTextData | null>(null);
  const draft = useDraftDoc().controller;

  const onChange = (newValue: RichTextData | null) => {
    setValue((oldValue: RichTextData | null) => {
      // Only write when the content actually changed. An editor re-emits its
      // value with a fresh `time` after rendering an external replacement
      // (e.g. "discard draft edits"), and that echo must not re-dirty the
      // draft.
      if (!testSameRichTextContent(oldValue, newValue)) {
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
      deepKey={props.deepKey}
      value={value}
      placeholder={field.placeholder}
      blockComponents={field.blockComponents}
      inlineComponents={field.inlineComponents}
      paragraphSizes={field.paragraphSizes}
      onChange={onChange}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      autosize={field.autosize}
    />
  );
}
