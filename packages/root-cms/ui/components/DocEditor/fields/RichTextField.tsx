import * as schema from '../../../../core/schema.js';
import {RichTextData} from '../../../../shared/richtext.js';
import {useDraftDoc} from '../../../hooks/useDraftDoc.js';
import {RichTextEditor} from '../../RichTextEditor/RichTextEditor.js';
import {FieldProps} from './FieldProps.js';

export function RichTextField(props: FieldProps) {
  const field = props.field as schema.RichTextField;
  const draft = useDraftDoc();

  const onChange = (newValue: RichTextData) => {
    if (props.value?.time !== newValue?.time) {
      draft.controller.updateKey(props.deepKey, newValue);
    }
  };

  return (
    <RichTextEditor
      value={props.value}
      placeholder={field.placeholder}
      onChange={onChange}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
    />
  );
}
