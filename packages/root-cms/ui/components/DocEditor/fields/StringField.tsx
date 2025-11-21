import {TextInput, Textarea} from '@mantine/core';
import {ChangeEvent} from 'preact/compat';
import * as schema from '../../../../core/schema.js';
import {useDraftDocValue} from '../../../hooks/useDraftDoc.js';
import {requestHighlightNode} from '../../../utils/iframe-preview.js';
import {FieldProps} from './FieldProps.js';

export function StringField(props: FieldProps) {
  const field = props.field as schema.StringField;
  const [value, setValue] = useDraftDocValue(props.deepKey, '');

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValue(e.currentTarget.value);
  };

  const onFocus = (e: FocusEvent) => {
    props.onFocus?.(e);
    requestHighlightNode(props.deepKey, {scroll: true});
  };

  const onBlur = (e: FocusEvent) => {
    props.onBlur?.(e);
    requestHighlightNode(null);
  };

  if (field.variant === 'textarea') {
    return (
      <Textarea
        size="xs"
        radius={0}
        autosize={field.autosize}
        minRows={4}
        maxRows={field.maxRows || 12}
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    );
  }
  return (
    <TextInput
      size="xs"
      radius={0}
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}
