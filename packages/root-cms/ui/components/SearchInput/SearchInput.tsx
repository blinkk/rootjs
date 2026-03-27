import './SearchInput.css';

import {IconSearch, IconX} from '@tabler/icons-preact';
import {joinClassNames} from '../../utils/classes.js';

interface SearchInputProps {
  /** Current search query value. */
  value: string;
  /** Callback when the search value changes. */
  onChange: (value: string) => void;
  /** Placeholder text for the input. */
  placeholder?: string;
  /** Optional keyboard shortcut hint to display (e.g. "⌘K"). */
  shortcutHint?: string;
  /** Additional CSS class name. */
  className?: string;
  /** Whether the input should auto-focus. */
  autoFocus?: boolean;
  /** Callback when the input is focused. */
  onFocus?: () => void;
  /** Whether the input is read-only (used for trigger inputs). */
  readOnly?: boolean;
  /** Callback when a key is pressed. */
  onKeyDown?: (e: KeyboardEvent) => void;
}

/**
 * Reusable search input with a search icon, optional clear button,
 * and optional keyboard shortcut hint.
 */
export function SearchInput(props: SearchInputProps) {
  const {
    value,
    onChange,
    placeholder = 'Search...',
    shortcutHint,
    className,
    autoFocus,
    onFocus,
    readOnly,
    onKeyDown,
  } = props;

  return (
    <div className={joinClassNames('SearchInput', className)}>
      <div className="SearchInput__icon">
        <IconSearch size={14} strokeWidth={1.75} />
      </div>
      <input
        className="SearchInput__input"
        type="text"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        readOnly={readOnly}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
      />
      {value && !readOnly ? (
        <button
          className="SearchInput__clear"
          onClick={() => onChange('')}
          type="button"
          aria-label="Clear search"
        >
          <IconX size={14} strokeWidth={2} />
        </button>
      ) : shortcutHint && !value ? (
        <span className="SearchInput__shortcut">{shortcutHint}</span>
      ) : null}
    </div>
  );
}
