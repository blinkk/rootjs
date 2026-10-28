import {useEffect, useMemo, useState} from 'preact/hooks';
import * as schema from '../../../../../../core/schema.js';
import {MultiSelect} from '../../../../../primitives/MultiSelect/MultiSelect.js';
import {Spinner} from '../../../../../primitives/Spinner/Spinner.js';
import {FieldOption, resolveFieldSource} from '../../../field-source.js';
import {useDraftDocValue} from '../../../useDraftDoc.js';
import {FieldProps} from './FieldProps.js';
import {SourceDocButton} from './SourceField.js';

export function MultiSelectField(props: FieldProps) {
  const field = props.field as schema.MultiSelectField;
  const [rawValue, setValue] = useDraftDocValue<unknown>(props.deepKey, []);
  // Docs can hold a single string (e.g. after a schema changed from a
  // select) or other stray data; treat those as a list rather than crash.
  const value = useMemo(() => toStringList(rawValue), [rawValue]);
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
      // Options need both a label and a value.
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
    for (const selected of value) {
      if (selected && !optionsByValue.has(selected)) {
        optionsByValue.set(selected, {value: selected, label: selected});
      }
    }
    return Array.from(optionsByValue.values());
  }, [field.source, sourceOptions, staticOptions, created, value]);

  const multiSelect = (
    <MultiSelect
      // An option's `description` (from the source's `helpKey`) shows beneath
      // its label in the dropdown.
      data={data}
      aria-label={field.label || field.id}
      className="rounded-none"
      placeholder={field.placeholder}
      value={value}
      creatable={field.creatable || false}
      getCreateLabel={(query: string) => `+ Add "${query}"`}
      onCreate={(query: string) => {
        const item = {value: query, label: query};
        setCreated((current) => [...current, item]);
        return item;
      }}
      onValueChange={(newValue: string[]) => setValue(newValue)}
      nothingFound={loading ? 'Loading…' : undefined}
      rightSection={loading ? <Spinner size="sm" /> : undefined}
    />
  );

  if (field.source?.doc) {
    return (
      <div className="DocEditor__MultiSelectField flex items-center gap-2">
        <div className="DocEditor__MultiSelectField__input min-w-0 flex-1">
          {multiSelect}
        </div>
        <SourceDocButton source={field.source} />
      </div>
    );
  }
  return <div className="DocEditor__MultiSelectField">{multiSelect}</div>;
}

/** Coerces a stored multiselect value to a list of strings. */
function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string' && value) {
    return [value];
  }
  return [];
}
