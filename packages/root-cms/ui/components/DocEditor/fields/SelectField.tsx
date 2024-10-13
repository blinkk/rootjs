import {Select} from '@mantine/core';
import {useEffect, useState} from 'preact/hooks';
import {FieldProps} from './FieldProps.js';
import * as schema from '@/../core/schema.js';

export function SelectField(props: FieldProps) {
  const field = props.field as schema.SelectField;
  const [value, setValue] = useState('');

  const options = (field.options || []).map((option) => {
    // Mantine requires both label and value to be set.
    if (typeof option === 'string') {
      return {label: option, value: option};
    }
    return {
      label: option.label ?? option.value ?? '',
      value: option.value ?? option.label ?? '',
    };
  });

  function onChange(newValue: string) {
    props.draft.updateKey(`${props.deepKey}`, newValue);
    setValue(newValue || '');
  }

  useEffect(() => {
    const unsubscribe = props.draft.subscribe(
      props.deepKey,
      (newValue: string) => {
        setValue(newValue || '');
      }
    );
    return unsubscribe;
  }, []);

  return (
    <div className="DocEditor__SelectField">
      <Select
        data={options}
        placeholder={field.placeholder}
        value={value}
        onChange={(e: string) => onChange(e || '')}
        size="xs"
        radius={0}
        // Due to issues with preact/compat, use a div for the dropdown el.
        dropdownComponent="div"
      />
    </div>
  );
}
