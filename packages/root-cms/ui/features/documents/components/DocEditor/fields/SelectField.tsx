import {useEffect, useMemo, useState} from 'preact/hooks';
import * as schema from '../../../../../../core/schema.js';
import {Select} from '../../../../../primitives/Select/Select.js';
import {Spinner} from '../../../../../primitives/Spinner/Spinner.js';
import {FieldOption, resolveFieldSource} from '../../../field-source.js';
import {useDraftDocValue} from '../../../useDraftDoc.js';
import {FieldProps} from './FieldProps.js';
import {SourceDocButton} from './SourceField.js';

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
      // Both a label and a value are needed to show and pick the option.
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
      className="min-w-0 flex-1"
      classNames={{input: 'rounded-none'}}
      aria-label={field.label || field.id}
      data={data}
      placeholder={field.placeholder}
      value={value || null}
      onValueChange={(newValue) => setValue(newValue || '')}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      searchable={field.searchable ?? true}
      clearable
      creatable={field.creatable || false}
      getCreateLabel={(query: string) => `+ Add "${query}"`}
      onCreate={(query: string) => {
        const item = {value: query, label: query};
        setCreated((current) => [...current, item]);
        return item;
      }}
      nothingFound={loading ? 'Loading…' : undefined}
      rightSection={loading ? <Spinner size="sm" label={null} /> : undefined}
    />
  );

  return (
    <div className="DocEditor__SelectField flex items-center gap-2">
      {select}
      <SourceDocButton source={field.source} />
    </div>
  );
}
