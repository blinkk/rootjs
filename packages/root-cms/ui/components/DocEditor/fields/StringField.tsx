import {TextInput, Textarea} from '@mantine/core';
import {ChangeEvent, useCallback} from 'preact/compat';
import * as schema from '../../../../core/schema.js';
import {useDraftDoc} from '../../../hooks/useDraftDoc.js';
import {requestHighlightNode} from '../../../utils/iframe-preview.js';
import {FieldProps} from './FieldProps.js';

export function StringField(props: FieldProps) {
  const field = props.field as schema.StringField;
  const draft = useDraftDoc();

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = e.currentTarget.value || '';
      draft.controller.updateKey(props.deepKey, value);
    },
    [draft]
  );

  if (field.variant === 'textarea') {
    return (
      <Textarea
        size="xs"
        radius={0}
        autosize={false}
        minRows={4}
        maxRows={field.maxRows || 12}
        value={props.value}
        onChange={onChange}
        onFocus={(e: FocusEvent) => {
          props.onFocus?.(e);
          requestHighlightNode(props.deepKey, {scroll: true});
        }}
        onBlur={(e: FocusEvent) => {
          props.onBlur?.(e);
          requestHighlightNode(null);
        }}
      />
    );
  }
  return (
    <TextInput
      size="xs"
      radius={0}
      value={props.value}
      onChange={onChange}
      onFocus={(e: FocusEvent) => {
        props.onFocus?.(e);
        requestHighlightNode(props.deepKey, {scroll: true});
      }}
      onBlur={(e: FocusEvent) => {
        props.onBlur?.(e);
        requestHighlightNode(null);
      }}
    />
  );
}
