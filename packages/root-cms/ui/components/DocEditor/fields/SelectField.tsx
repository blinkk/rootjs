import {Select} from '@mantine/core';
import {useCallback, useEffect, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {FieldProps} from './FieldProps.js';

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

  const onChange = useCallback(
    (newValue: string) => {
      props.draft.updateKey(`${props.deepKey}`, newValue);
      setValue(newValue || '');
    },
    [props.deepKey]
  );

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
        searchable={field.searchable ?? true}
        // Due to issues with preact/compat, use a div for the dropdown el.
        dropdownComponent="div"
      />
    </div>
  );
}
