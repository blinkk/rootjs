import {TextInput, Textarea} from '@mantine/core';
import {ChangeEvent} from 'preact/compat';
import {useEffect, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {FieldProps} from './Field.js';
import {useFieldEditor} from '../hooks/useFieldEditor.js';

export function StringField(props: FieldProps) {
  const field = props.field as schema.StringField;
  const [value, setValue] = useState('');
  const fieldEditor = useFieldEditor();

  function onChange(newValue: string) {
    setValue(newValue);
    fieldEditor.set(props.deepKey, newValue);
  }

  useEffect(() => {
    const unsubscribe = fieldEditor.subscribe(
      props.deepKey,
      (newValue: string) => {
        setValue(newValue);
      }
    );
    return unsubscribe;
  }, []);

  if (field.variant === 'textarea') {
    return (
      <Textarea
        size="xs"
        radius={0}
        autosize
        minRows={2}
        maxRows={field.maxRows || 12}
        value={value}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
          onChange(e.currentTarget.value);
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
    />
  );
}
