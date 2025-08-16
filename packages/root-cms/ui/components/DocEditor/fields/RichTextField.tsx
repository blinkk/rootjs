import {useCallback, useEffect, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {RichTextData} from '../../../../shared/richtext.js';
import {RichTextEditor} from '../../RichTextEditor/RichTextEditor.js';
import {FieldProps} from './FieldProps.js';

export function RichTextField(props: FieldProps) {
  const field = props.field as schema.RichTextField;
  const [value, setValue] = useState<RichTextData | null>(null);

  const onChange = useCallback(
    (newValue: RichTextData) => {
      setValue((oldValue: RichTextData | null) => {
        if (oldValue?.time !== newValue?.time) {
          props.draft.updateKey(props.deepKey, newValue);
        }
        return newValue;
      });
    },
    [props.deepKey]
  );

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
