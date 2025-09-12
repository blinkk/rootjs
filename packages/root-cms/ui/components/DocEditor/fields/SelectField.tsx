import {Select} from '@mantine/core';
import {useMemo} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {useDraftDocValue} from '../../../hooks/useDraftDoc.js';
import {FieldProps} from './FieldProps.js';

export function SelectField(props: FieldProps) {
  const field = props.field as schema.SelectField;
  const [value, setValue] = useDraftDocValue(props.deepKey, '');

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
    <div className="DocEditor__SelectField">
      <Select
        data={options}
        placeholder={field.placeholder}
        value={value}
        onChange={(e: string) => setValue(e || '')}
        size="xs"
        radius={0}
        searchable={field.searchable ?? true}
        // Due to issues with preact/compat, use a div for the dropdown el.
        dropdownComponent="div"
      />
    </div>
  );
}
