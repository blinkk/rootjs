import {MultiSelect} from '@mantine/core';
import {useMemo} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {useDraftDocValue} from '../../../hooks/useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

export function MultiSelectField(props: FieldProps) {
  const field = props.field as schema.MultiSelectField;
  const [value, setValue] = useDraftDocValue<string[]>(props.deepKey, []);

  const options = useMemo(() => {
    return (field.options || []).map((option) => {
      // Mantine requires both label and value to be set.
      if (typeof option === 'string') {
        return {label: option, value: option};
      }
      return {
        label: option.label ?? option.value ?? '',
        value: option.value ?? option.label ?? '',
      };
    });
  }, [field.options]);

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
        onChange={(newValue: string[]) => setValue(newValue)}
        // Due to issues with preact/compat, use a div for the dropdown el.
        dropdownComponent="div"
      />
    </div>
  );
}
