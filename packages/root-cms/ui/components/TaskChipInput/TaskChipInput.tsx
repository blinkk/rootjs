import './TaskChipInput.css';

import {ActionIcon, TextInput} from '@mantine/core';
import {IconX} from '@tabler/icons-preact';
import {ChangeEvent} from 'preact/compat';
import {useState} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';

export interface TaskChipInputProps {
  className?: string;
  values: string[];
  placeholder?: string;
  disabled?: boolean;
  /** Renders the chip label; defaults to the raw value. */
  formatValue?: (value: string) => string;
  /**
   * Validates and normalizes a value before it is added. Return null to
   * reject the entry (the input keeps the text so it can be corrected).
   */
  normalizeValue?: (value: string) => string | null;
  onChange: (values: string[]) => void;
}

/**
 * A token/chip input used for the task fields that hold a list of short
 * strings (tags, followers, blocking task ids). Commas and Enter commit
 * the current entry; Backspace on an empty input removes the last chip.
 */
export function TaskChipInput(props: TaskChipInputProps) {
  const {values, onChange} = props;
  const [draft, setDraft] = useState('');

  function addDraft() {
    const raw = draft.trim().replace(/,$/, '').trim();
    if (!raw) {
      setDraft('');
      return;
    }
    const normalized = props.normalizeValue ? props.normalizeValue(raw) : raw;
    if (!normalized) {
      return;
    }
    if (!values.includes(normalized)) {
      onChange([...values, normalized]);
    }
    setDraft('');
  }

  function removeValue(value: string) {
    onChange(values.filter((item) => item !== value));
  }

  return (
    <div className={joinClassNames(props.className, 'TaskChipInput')}>
      {values.length > 0 && (
        <div className="TaskChipInput__chips">
          {values.map((value) => (
            <span className="TaskChipInput__chip" key={value}>
              <span className="TaskChipInput__chip__label">
                {props.formatValue ? props.formatValue(value) : value}
              </span>
              <ActionIcon
                className="TaskChipInput__chip__remove"
                size="xs"
                disabled={props.disabled}
                aria-label={`Remove ${value}`}
                onClick={() => removeValue(value)}
              >
                <IconX size={12} strokeWidth="2" />
              </ActionIcon>
            </span>
          ))}
        </div>
      )}
      <TextInput
        size="xs"
        value={draft}
        disabled={props.disabled}
        placeholder={props.placeholder}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          setDraft(e.currentTarget.value)
        }
        onBlur={() => addDraft()}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addDraft();
            return;
          }
          if (e.key === 'Backspace' && !draft && values.length > 0) {
            e.preventDefault();
            removeValue(values[values.length - 1]);
          }
        }}
      />
    </div>
  );
}
