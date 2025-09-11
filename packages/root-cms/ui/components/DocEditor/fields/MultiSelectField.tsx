import {MultiSelect} from '@mantine/core';
import {useCallback, useEffect, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {useDraftDoc, useDraftDocField} from '../../../hooks/useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

export function MultiSelectField(props: FieldProps) {
  const field = props.field as schema.MultiSelectField;
  const [value, setValue] = useState<string[]>([]);
  const draft = useDraftDoc().controller;

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
    (newValue: string[]) => {
      draft.updateKey(props.deepKey, newValue || []);
      setValue(newValue);
    },
    [props.deepKey]
  );

  useDraftDocField(props.deepKey, (newValue: string[]) => {
    setValue(newValue || []);
  });

  return (
    <div className="DocEditor__MultiSelectField">
      <MultiSelect
        data={options}
        size="xs"
        radius={0}
        placeholder={field.placeholder}
        value={value}
        searchable
        creatable={field.creatable || false}
        getCreateLabel={(query: string) => `+ Add "${query}"`}
        onChange={(newValue: string[]) => onChange(newValue)}
        // Due to issues with preact/compat, use a div for the dropdown el.
        dropdownComponent="div"
      />
    </div>
  );
}
