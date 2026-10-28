import {useMemo, useState} from 'preact/hooks';
import {MultiSelect} from '../../../primitives/MultiSelect/MultiSelect.js';
import {Select} from '../../../primitives/Select/Select.js';
import {cn} from '../../../utils/classes.js';
import {useProjectUsers} from '../useProjectUsers.js';
import {UserAvatar} from '../UserAvatar/UserAvatar.js';
import {
  buildUserSelectData,
  matchesQuery,
  shouldCreateItem,
  toFreeValueItem,
  toProfile,
  UserSelectItem,
} from './user-select-data.js';

/** Loads the project's users and tracks any emails typed in by hand. */
function useUserSelectData(selected: string[]) {
  const {users, loading} = useProjectUsers();
  const [created, setCreated] = useState<UserSelectItem[]>([]);

  const data = useMemo(
    () => buildUserSelectData({users, created, selected}),
    [users, created, selected.join(',')]
  );

  function addCreated(query: string) {
    setCreated((current) => [...current, toFreeValueItem(query)]);
  }

  return {data, loading, addCreated};
}

/** Dropdown option showing a user's avatar, display name, and email. */
function renderUserOption(item: UserSelectItem) {
  return (
    <div className="UserSelect__item flex min-w-0 items-center gap-2">
      <UserAvatar
        email={item.email}
        profile={toProfile(item)}
        size={24}
        withTooltip={false}
      />
      <div className="UserSelect__item__text flex min-w-0 flex-col leading-snug">
        <div className="UserSelect__item__label truncate text-sm">
          {item.label}
        </div>
        {item.email && item.email !== item.label && (
          <div className="UserSelect__item__email truncate text-xs text-muted">
            {item.email}
          </div>
        )}
      </div>
    </div>
  );
}

export interface UserSelectProps {
  /** Currently selected email, or an empty string when unset. */
  value: string;
  /** Called with the selected email (empty string when cleared). */
  onChange: (email: string) => void;
  /** Placeholder text shown when nothing is selected. */
  placeholder?: string;
  /** Disables interaction, e.g. while a save is in flight. */
  disabled?: boolean;
  /** Optional className for the wrapping element. */
  className?: string;
  /** Focuses the input on mount. */
  autoFocus?: boolean;
  /** Opens the dropdown on mount, e.g. when rendered inside a popover. */
  initiallyOpened?: boolean;
}

/**
 * Single-user picker: an autocomplete dropdown of the project's users (with
 * avatars) that also accepts any email address typed in by hand.
 *
 * Example:
 *   <UserSelect value={assignee} onChange={setAssignee} />
 */
export function UserSelect(props: UserSelectProps) {
  const value = (props.value || '').trim().toLowerCase();
  const selected = useMemo(() => (value ? [value] : []), [value]);
  const {data, loading, addCreated} = useUserSelectData(selected);
  const selectedItem = data.find((item) => item.value === value);

  return (
    <Select<UserSelectItem>
      className={cn('UserSelect', props.className)}
      size="sm"
      data={data}
      value={value || null}
      onValueChange={(newValue) => props.onChange(newValue || '')}
      placeholder={props.placeholder || 'Search or enter an email'}
      aria-label={props.placeholder || 'Search or enter an email'}
      disabled={props.disabled}
      autoFocus={props.autoFocus}
      defaultOpen={props.initiallyOpened}
      searchable
      clearable
      creatable
      leftSection={
        value ? (
          <UserAvatar
            email={value}
            // While the user list loads, `profile` is left undefined so the
            // avatar falls back to fetching the profile on its own.
            profile={selectedItem ? toProfile(selectedItem) : undefined}
            size={16}
            withTooltip={false}
          />
        ) : undefined
      }
      renderOption={renderUserOption}
      filter={(query, item) => matchesQuery(query, item)}
      shouldCreate={shouldCreateItem}
      getCreateLabel={(query) => `+ Use "${query.trim()}"`}
      onCreate={(query) => {
        addCreated(query);
      }}
      nothingFound={loading ? 'Loading…' : 'No users found'}
      maxDropdownHeight={280}
    />
  );
}

/** Chip label for each selected user in the multi-user picker. */
function renderUserValue(item: UserSelectItem) {
  return (
    <span
      className="UserSelect__value inline-flex min-w-0 items-center gap-1"
      title={item.email}
      // Lets callers read the underlying email off the chip, e.g. to copy the
      // full addresses instead of the display names.
      data-user-email={item.email}
    >
      <UserAvatar
        email={item.email}
        profile={toProfile(item)}
        size={14}
        withTooltip={false}
      />
      <span className="UserSelect__value__label truncate">{item.label}</span>
    </span>
  );
}

export interface UserMultiSelectProps {
  /** Currently selected emails. */
  value: string[];
  /** Called with the updated list of emails. */
  onChange: (emails: string[]) => void;
  /** Placeholder text shown when nothing is selected. */
  placeholder?: string;
  /** Disables interaction, e.g. while a save is in flight. */
  disabled?: boolean;
  /** Optional className for the wrapping element. */
  className?: string;
}

/**
 * Multi-user picker: an autocomplete dropdown of the project's users (with
 * avatars) that also accepts any email address typed in by hand. Selected
 * users render as removable chips.
 *
 * Example:
 *   <UserMultiSelect value={cc} onChange={setCc} />
 */
export function UserMultiSelect(props: UserMultiSelectProps) {
  const value = useMemo(
    () => (props.value || []).map((email) => email.trim().toLowerCase()),
    [(props.value || []).join(',')]
  );
  const {data, loading, addCreated} = useUserSelectData(value);

  return (
    <MultiSelect<UserSelectItem>
      className={cn('UserSelect', 'UserSelect--multi', props.className)}
      size="sm"
      data={data}
      value={value}
      onValueChange={(newValue) => props.onChange(newValue)}
      placeholder={props.placeholder || 'Search or enter an email'}
      aria-label={props.placeholder || 'Search or enter an email'}
      disabled={props.disabled}
      creatable
      renderOption={renderUserOption}
      renderValue={renderUserValue}
      getRemoveLabel={(item) => `Remove ${item.email}`}
      filter={(query, item) => matchesQuery(query, item)}
      shouldCreate={shouldCreateItem}
      getCreateLabel={(query) => `+ Add "${query.trim()}"`}
      onCreate={(query) => {
        addCreated(query);
      }}
      nothingFound={loading ? 'Loading…' : 'No users found'}
      maxDropdownHeight={280}
    />
  );
}
