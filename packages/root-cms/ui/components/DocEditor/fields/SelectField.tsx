import {Loader, Select} from '@mantine/core';
import {useEffect, useMemo, useState} from 'preact/hooks';
import * as schema from '../../../../core/schema.js';
import {useDraftDocValue} from '../../../hooks/useDraftDoc.js';
import {FieldOption, resolveFieldSource} from '../../../utils/field-source.js';
import {FieldProps} from './FieldProps.js';
import {FieldSourceItem, SourceDocButton} from './SourceField.js';

export function SelectField(props: FieldProps) {
  const field = props.field as schema.SelectField;
  const [value, setValue] = useDraftDocValue(props.deepKey, '');
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
    // Always include the current value so its label renders, even if the source
    // options haven't loaded yet or the value was removed from the list.
    if (value && !optionsByValue.has(value)) {
      optionsByValue.set(value, {value, label: value});
    }
    return Array.from(optionsByValue.values());
  }, [field.source, sourceOptions, staticOptions, created, value]);

  const select = (
    <Select
      data={data}
      placeholder={field.placeholder}
      value={value || null}
      onChange={(e: string) => setValue(e || '')}
      size="xs"
      radius={0}
      searchable={field.searchable ?? true}
      clearable={true}
      creatable={field.creatable || false}
      getCreateLabel={(query: string) => `+ Add "${query}"`}
      onCreate={(query: string) => {
        const item = {value: query, label: query};
        setCreated((current) => [...current, item]);
        return item;
      }}
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
        className="DocEditor__SelectField"
        style={{display: 'flex', alignItems: 'center', gap: 8}}
      >
        <div style={{flex: 1, minWidth: 0}}>{select}</div>
        <SourceDocButton source={field.source} />
      </div>
    );
  }
  return <div className="DocEditor__SelectField">{select}</div>;
}
