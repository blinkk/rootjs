import {TextInput, Textarea} from '@mantine/core';
import {ChangeEvent} from 'preact/compat';
import {useCallback, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {useDraftDoc, useDraftDocField} from '../../../hooks/useDraftDoc.js';
import {requestHighlightNode} from '../../../utils/iframe-preview.js';
import {FieldProps} from './FieldProps.js';

export function StringField(props: FieldProps) {
  const field = props.field as schema.StringField;
  const [value, setValue] = useState('');
  const draft = useDraftDoc().controller;

  const onChange = useCallback(
    (newValue: string) => {
      setValue(newValue);
      draft.updateKey(props.deepKey, newValue);
    },
    [props.deepKey, draft]
  );

  useDraftDocField(props.deepKey, (newValue: string) => {
    setValue(newValue);
  });

  if (field.variant === 'textarea') {
    return (
      <Textarea
        size="xs"
        radius={0}
        autosize={false}
        minRows={4}
        maxRows={field.maxRows || 12}
        value={value}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
          onChange(e.currentTarget.value);
        }}
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
      value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        onChange(e.currentTarget.value);
      }}
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
