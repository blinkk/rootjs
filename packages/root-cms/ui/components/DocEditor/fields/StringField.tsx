import {TextInput, Textarea} from '@mantine/core';
import {ChangeEvent} from 'preact/compat';
import {useEffect, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {FieldProps} from './FieldProps.js';

export function StringField(props: FieldProps) {
  const field = props.field as schema.StringField;
  const [value, setValue] = useState('');
  const [autosize, setAutosize] = useState(false);

  function onChange(newValue: string) {
    setValue(newValue);
    props.draft.updateKey(props.deepKey, newValue);
  }

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
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
        autosize={autosize}
        minRows={3}
        maxRows={field.maxRows || 12}
        value={value}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
          onChange(e.currentTarget.value);
        }}
        onFocus={() => {
          if (!autosize) {
            setAutosize(true);
          }
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
