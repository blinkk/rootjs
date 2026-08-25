import './UserSelect.css';

import {CloseButton, MultiSelect, Select} from '@mantine/core';
import {forwardRef} from 'preact/compat';
import {useMemo, useState} from 'preact/hooks';
import {useProjectUsers} from '../../hooks/useProjectUsers.js';
import {joinClassNames} from '../../utils/classes.js';
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

/** Returns a copy of `props` with the given keys removed. */
function omitProps(props: Record<string, any>, keys: string[]) {
  const rest: Record<string, any> = {};
  Object.keys(props).forEach((key) => {
    if (!keys.includes(key)) {
      rest[key] = props[key];
    }
  });
  return rest;
}

/** Fields supplied by the `data` entries, which must not reach the DOM. */
const ITEM_PROPS = [
  'value',
  'label',
  'email',
  'displayName',
  'photoURL',
  'freeValue',
];

/**
 * Dropdown option showing a user's avatar, display name, and email. Mantine
 * passes each `data` entry's fields through as props.
 */
const UserSelectItemComponent = forwardRef((props: any, ref: any) => {
  const {label, email} = props;
  const others = omitProps(props, ITEM_PROPS);
  const profile = toProfile(props);
  return (
    <div {...others} ref={ref}>
      <div className="UserSelect__item">
        <UserAvatar
          email={email}
          profile={profile}
          size={24}
          withTooltip={false}
        />
        <div className="UserSelect__item__text">
          <div className="UserSelect__item__label">{label}</div>
          {email && email !== label && (
            <div className="UserSelect__item__email">{email}</div>
          )}
        </div>
      </div>
    </div>
  );
});

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
    <Select
      className={joinClassNames('UserSelect', props.className)}
      size="xs"
      data={data}
      value={value || null}
      onChange={(newValue: string | null) => props.onChange(newValue || '')}
      placeholder={props.placeholder || 'Search or enter an email'}
      disabled={props.disabled}
      searchable
      clearable
      creatable
      icon={
        value ? (
          <UserAvatar
            email={value}
            // While the user list loads, `profile` is left undefined so the
            // avatar falls back to fetching the profile on its own.
            profile={selectedItem ? toProfile(selectedItem) : undefined}
            size={20}
            withTooltip={false}
          />
        ) : undefined
      }
      itemComponent={UserSelectItemComponent}
      filter={(query: string, item: UserSelectItem) =>
        matchesQuery(query, item)
      }
      shouldCreate={shouldCreateItem}
      getCreateLabel={(query: string) => `+ Use "${query.trim()}"`}
      onCreate={(query: string) => addCreated(query)}
      nothingFound={loading ? 'Loading…' : 'No users found'}
      maxDropdownHeight={280}
      // Due to issues with preact/compat, use a div for the dropdown el.
      dropdownComponent="div"
    />
  );
}

/** Styling props Mantine passes to `valueComponent` that the chip handles. */
const VALUE_PROPS = [
  ...ITEM_PROPS,
  'onRemove',
  'classNames',
  'styles',
  'size',
  'radius',
  'variant',
  'disabled',
  'readOnly',
];

/** Chip rendered for each selected user in the multi-user picker. */
const UserSelectValueComponent = forwardRef((props: any, ref: any) => {
  const {label, email, onRemove} = props;
  const others = omitProps(props, VALUE_PROPS);
  const profile = toProfile(props);
  return (
    <div
      {...others}
      ref={ref}
      className="UserSelect__value"
      title={email}
      // Lets callers read the underlying email off the chip, e.g. to copy the
      // full addresses instead of the display names.
      data-user-email={email}
    >
      <UserAvatar
        email={email}
        profile={profile}
        size={18}
        withTooltip={false}
      />
      <span className="UserSelect__value__label">{label}</span>
      {!props.disabled && !props.readOnly && (
        <CloseButton
          className="UserSelect__value__remove"
          onMouseDown={onRemove}
          size={16}
          iconSize={12}
          variant="transparent"
        />
      )}
    </div>
  );
});

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
    <MultiSelect
      className={joinClassNames(
        'UserSelect',
        'UserSelect--multi',
        props.className
      )}
      size="xs"
      data={data}
      value={value}
      onChange={(newValue: string[]) => props.onChange(newValue)}
      placeholder={props.placeholder || 'Search or enter an email'}
      disabled={props.disabled}
      searchable
      clearSearchOnChange
      creatable
      itemComponent={UserSelectItemComponent}
      valueComponent={UserSelectValueComponent}
      filter={(query: string, selected: boolean, item: UserSelectItem) =>
        !selected && matchesQuery(query, item)
      }
      shouldCreate={shouldCreateItem}
      getCreateLabel={(query: string) => `+ Add "${query.trim()}"`}
      onCreate={(query: string) => addCreated(query)}
      nothingFound={loading ? 'Loading…' : 'No users found'}
      maxDropdownHeight={280}
      // Due to issues with preact/compat, use a div for the dropdown el.
      dropdownComponent="div"
    />
  );
}
