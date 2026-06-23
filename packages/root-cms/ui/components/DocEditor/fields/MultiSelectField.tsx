import {Loader, MultiSelect} from '@mantine/core';
import {useEffect, useMemo, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {useDraftDocValue} from '../../../hooks/useDraftDoc.js';
import {FieldOption, resolveFieldSource} from '../../../utils/field-source.js';
import {FieldProps} from './FieldProps.js';
import {FieldSourceItem, SourceDocButton} from './SourceField.js';

export function MultiSelectField(props: FieldProps) {
  const field = props.field as schema.MultiSelectField;
  const [value, setValue] = useDraftDocValue<string[]>(props.deepKey, []);
  const [sourceOptions, setSourceOptions] = useState<FieldOption[]>([]);
  const [created, setCreated] = useState<FieldOption[]>([]);
  const [loading, setLoading] = useState(Boolean(field.source));

  // Resolve options from a document source, if configured.
  useEffect(() => {
    if (!field.source) {
      return;
    }
    let active = true;
    setLoading(true);
    resolveFieldSource(field.source)
      .then((options) => {
        if (active) {
          setSourceOptions(options);
        }
      })
      .catch((err) => {
        console.error('failed to resolve field source:', err);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [field.source]);

  const staticOptions = useMemo<FieldOption[]>(() => {
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

  const data = useMemo(() => {
    const optionsByValue = new Map<string, FieldOption>();
    const base = field.source ? sourceOptions : staticOptions;
    for (const option of base) {
      optionsByValue.set(option.value, option);
    }
    for (const option of created) {
      if (!optionsByValue.has(option.value)) {
        optionsByValue.set(option.value, option);
      }
    }
    // Include any selected values not present in the options list.
    for (const selected of value || []) {
      if (selected && !optionsByValue.has(selected)) {
        optionsByValue.set(selected, {value: selected, label: selected});
      }
    }
    return Array.from(optionsByValue.values());
  }, [field.source, sourceOptions, staticOptions, created, value]);

  const multiSelect = (
    <MultiSelect
      data={data}
      size="xs"
      radius={0}
      placeholder={field.placeholder}
      value={value}
      searchable
      creatable={field.creatable || false}
      getCreateLabel={(query: string) => `+ Add "${query}"`}
      onCreate={(query: string) => {
        const item = {value: query, label: query};
        setCreated((current) => [...current, item]);
        return item;
      }}
      onChange={(newValue: string[]) => setValue(newValue)}
      itemComponent={field.source?.helpKey ? FieldSourceItem : undefined}
      nothingFound={loading ? 'Loading…' : undefined}
      rightSection={loading ? <Loader size="xs" /> : undefined}
      // Due to issues with preact/compat, use a div for the dropdown el.
      dropdownComponent="div"
    />
  );

  if (field.source?.doc) {
    return (
      <div
        className="DocEditor__MultiSelectField"
        style={{display: 'flex', alignItems: 'center', gap: 8}}
      >
        <div style={{flex: 1, minWidth: 0}}>{multiSelect}</div>
        <SourceDocButton source={field.source} />
      </div>
    );
  }
  return <div className="DocEditor__MultiSelectField">{multiSelect}</div>;
}
