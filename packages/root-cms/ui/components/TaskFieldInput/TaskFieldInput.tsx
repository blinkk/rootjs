import './TaskFieldInput.css';

import {Checkbox, MultiSelect, Select, TextInput} from '@mantine/core';
import {Timestamp} from 'firebase/firestore';
import {ChangeEvent} from 'preact/compat';
import {joinClassNames} from '../../utils/classes.js';
import {
  TaskFieldDef,
  TaskFieldOption,
  TaskFieldValue,
} from '../../utils/tasks.js';

export interface TaskFieldInputProps {
  className?: string;
  fieldDef: TaskFieldDef;
  value: TaskFieldValue;
  disabled?: boolean;
  onChange: (value: TaskFieldValue) => void;
}

/** Renders the editing control for one project-defined custom field. */
export function TaskFieldInput(props: TaskFieldInputProps) {
  const {fieldDef, value, disabled, onChange} = props;
  const className = joinClassNames(props.className, 'TaskFieldInput');
  const options = (fieldDef.options || []).map((option) => ({
    value: option.value,
    label: option.label,
  }));

  switch (fieldDef.type) {
    case 'number':
      return (
        <TextInput
          className={className}
          size="xs"
          type="number"
          disabled={disabled}
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const raw = e.currentTarget.value;
            if (raw === '') {
              onChange(null);
              return;
            }
            const parsed = Number(raw);
            onChange(Number.isNaN(parsed) ? null : parsed);
          }}
        />
      );
    case 'date':
      return (
        <input
          className={joinClassNames(className, 'TaskFieldInput__date')}
          type="date"
          disabled={disabled}
          value={formatTaskFieldDateInput(value)}
          onInput={(e) => {
            const raw = (e.currentTarget as HTMLInputElement).value;
            onChange(raw ? parseTaskFieldDateInput(raw) : null);
          }}
        />
      );
    case 'select':
      return (
        <Select
          className={className}
          size="xs"
          clearable
          data={options}
          disabled={disabled}
          value={typeof value === 'string' ? value : null}
          onChange={(next: string | null) => onChange(next || null)}
        />
      );
    case 'multiselect':
      return (
        <MultiSelect
          className={className}
          size="xs"
          data={options}
          disabled={disabled}
          value={Array.isArray(value) ? value : []}
          onChange={(next: string[]) => onChange(next)}
        />
      );
    case 'checkbox':
      return (
        <Checkbox
          className={className}
          size="xs"
          disabled={disabled}
          checked={value === true}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onChange(e.currentTarget.checked)
          }
        />
      );
    case 'text':
    default:
      return (
        <TextInput
          className={className}
          size="xs"
          disabled={disabled}
          value={typeof value === 'string' ? value : ''}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onChange(e.currentTarget.value || null)
          }
        />
      );
  }
}

/** Renders a read-only custom field value, using option colors when set. */
export function TaskFieldValueDisplay(props: {
  fieldDef: TaskFieldDef;
  value: TaskFieldValue;
}) {
  const {fieldDef, value} = props;
  if (fieldDef.type === 'select' || fieldDef.type === 'multiselect') {
    const selected = Array.isArray(value)
      ? value
      : typeof value === 'string' && value
        ? [value]
        : [];
    if (selected.length === 0) {
      return <span className="TaskFieldValue TaskFieldValue--empty">—</span>;
    }
    return (
      <span className="TaskFieldValue">
        {selected.map((optionValue) => {
          const option = findTaskFieldOption(fieldDef, optionValue);
          return (
            <span
              className="TaskFieldValue__badge"
              key={optionValue}
              style={
                option?.color
                  ? {
                      background: option.color,
                      borderColor: option.color,
                    }
                  : undefined
              }
            >
              {option?.label || optionValue}
            </span>
          );
        })}
      </span>
    );
  }

  const text = formatTaskFieldValue(fieldDef, value);
  return (
    <span
      className={joinClassNames(
        'TaskFieldValue',
        !text && 'TaskFieldValue--empty'
      )}
    >
      {text || '—'}
    </span>
  );
}

/** Formats a custom field value as plain text (list columns, exports). */
export function formatTaskFieldValue(
  fieldDef: TaskFieldDef,
  value: TaskFieldValue
): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  switch (fieldDef.type) {
    case 'checkbox':
      return value === true ? 'Yes' : 'No';
    case 'date':
      return value instanceof Timestamp
        ? new Date(value.toMillis()).toLocaleDateString('en', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : '';
    case 'multiselect':
      return (Array.isArray(value) ? value : [])
        .map(
          (optionValue) =>
            findTaskFieldOption(fieldDef, optionValue)?.label || optionValue
        )
        .join(', ');
    case 'select':
      return typeof value === 'string'
        ? findTaskFieldOption(fieldDef, value)?.label || value
        : '';
    default:
      return String(value);
  }
}

function findTaskFieldOption(
  fieldDef: TaskFieldDef,
  value: string
): TaskFieldOption | undefined {
  return (fieldDef.options || []).find((option) => option.value === value);
}

/** Formats a date field value for an `<input type="date">`. */
function formatTaskFieldDateInput(value: TaskFieldValue): string {
  if (!(value instanceof Timestamp)) {
    return '';
  }
  const date = new Date(value.toMillis());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Parses a `yyyy-mm-dd` input value as a local-midnight timestamp. */
function parseTaskFieldDateInput(value: string): Timestamp | null {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return Timestamp.fromDate(new Date(year, month - 1, day));
}
