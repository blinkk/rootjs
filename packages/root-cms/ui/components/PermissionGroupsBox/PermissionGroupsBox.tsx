import {
  Accordion,
  ActionIcon,
  Badge,
  Button,
  MultiSelect,
  Select,
  TextInput,
} from '@mantine/core';
import {IconTrash, IconX} from '@tabler/icons-preact';
import {useMemo, useState} from 'preact/hooks';
import {UserRole} from '../../../core/client.js';
import {joinClassNames} from '../../utils/classes.js';
import {
  PermissionGroup,
  newPermissionGroup,
} from '../../utils/permissionGroups.js';
import {Text} from '../Text/Text.js';
import './PermissionGroupsBox.css';

const ROLE_OPTIONS = [
  {value: 'ADMIN', label: 'ADMIN'},
  {value: 'EDITOR', label: 'EDITOR'},
  {value: 'CONTRIBUTOR', label: 'CONTRIBUTOR'},
  {value: 'VIEWER', label: 'VIEWER'},
];

export interface PermissionGroupsBoxProps {
  className?: string;
  groups: PermissionGroup[];
  onChange: (groups: PermissionGroup[]) => void;
  collections: string[];
  disabled?: boolean;
}

export function PermissionGroupsBox(props: PermissionGroupsBoxProps) {
  const {groups, onChange, collections, disabled} = props;

  const collectionOptions = useMemo(
    () => collections.map((id) => ({value: id, label: id})),
    [collections]
  );

  function updateGroup(
    id: string,
    updater: (g: PermissionGroup) => PermissionGroup
  ) {
    onChange(groups.map((g) => (g.id === id ? updater(g) : g)));
  }

  function removeGroup(id: string) {
    onChange(groups.filter((g) => g.id !== id));
  }

  function addGroup() {
    onChange([...groups, newPermissionGroup({name: 'New group'})]);
  }

  return (
    <div className={joinClassNames(props.className, 'PermissionGroupsBox')}>
      {groups.length === 0 ? (
        <div className="PermissionGroupsBox__empty">
          <Text size="body-sm" weight="semi-bold" color="gray">
            No permission groups yet. Create one to organize users by role and
            optionally scope access to specific collections.
          </Text>
        </div>
      ) : (
        <Accordion
          multiple
          iconPosition="right"
          className="PermissionGroupsBox__accordion"
        >
          {groups.map((group) => (
            <Accordion.Item
              key={group.id}
              label={
                <div className="PermissionGroupsBox__trigger">
                  <span className="PermissionGroupsBox__trigger__name">
                    {group.name || 'Untitled group'}
                  </span>
                  <Badge
                    color="dark"
                    radius="sm"
                    size="sm"
                    variant="filled"
                    className="PermissionGroupsBox__trigger__badge"
                  >
                    {group.users.length}{' '}
                    {group.users.length === 1 ? 'user' : 'users'}
                  </Badge>
                </div>
              }
            >
              <PermissionGroupEditor
                group={group}
                collectionOptions={collectionOptions}
                disabled={disabled}
                onChange={(updated) => updateGroup(group.id, () => updated)}
                onDelete={() => removeGroup(group.id)}
              />
            </Accordion.Item>
          ))}
        </Accordion>
      )}
      <div className="PermissionGroupsBox__addGroup">
        <Button
          variant="default"
          size="xs"
          radius={0}
          disabled={disabled}
          onClick={addGroup}
        >
          + Add group
        </Button>
      </div>
    </div>
  );
}

interface PermissionGroupEditorProps {
  group: PermissionGroup;
  collectionOptions: {value: string; label: string}[];
  disabled?: boolean;
  onChange: (group: PermissionGroup) => void;
  onDelete: () => void;
}

function PermissionGroupEditor(props: PermissionGroupEditorProps) {
  const {group, collectionOptions, disabled} = props;
  const [emailInput, setEmailInput] = useState('');

  function setName(name: string) {
    props.onChange({...group, name});
  }

  function setRole(role: UserRole) {
    props.onChange({...group, role});
  }

  function setCollections(collections: string[]) {
    props.onChange({...group, collections});
  }

  function addUser(email: string) {
    const trimmed = email.trim();
    if (!trimmed || group.users.includes(trimmed)) {
      setEmailInput('');
      return;
    }
    props.onChange({...group, users: [...group.users, trimmed]});
    setEmailInput('');
  }

  function removeUser(email: string) {
    props.onChange({...group, users: group.users.filter((u) => u !== email)});
  }

  function confirmDelete() {
    if (
      window.confirm(
        `Delete the "${
          group.name || 'Untitled group'
        }" group? This will remove its role assignments on next save.`
      )
    ) {
      props.onDelete();
    }
  }

  return (
    <div className="PermissionGroupsBox__editor">
      <div className="PermissionGroupsBox__editor__row">
        <TextInput
          className="PermissionGroupsBox__editor__name"
          label="Group name"
          placeholder="e.g. Blog Post Editors"
          value={group.name}
          radius={0}
          size="xs"
          disabled={disabled}
          onChange={(e: any) => setName(e.target.value)}
        />
        <Select
          className="PermissionGroupsBox__editor__role"
          label="Role"
          data={ROLE_OPTIONS}
          value={group.role}
          radius={0}
          size="xs"
          disabled={disabled}
          onChange={(role: string) => setRole(role as UserRole)}
        />
      </div>
      <MultiSelect
        className="PermissionGroupsBox__editor__collections"
        label="Collections"
        description="Leave empty to apply project-wide. Otherwise restrict the group's role to the selected collections."
        data={collectionOptions}
        value={group.collections}
        radius={0}
        size="xs"
        searchable
        clearable
        placeholder="All collections (project-wide)"
        disabled={disabled}
        onChange={(value: string[]) => setCollections(value)}
        dropdownComponent="div"
      />
      <div className="PermissionGroupsBox__editor__users">
        <Text size="body-sm" weight="semi-bold">
          Users
        </Text>
        <form
          className="PermissionGroupsBox__editor__addUser"
          onSubmit={(e) => {
            e.preventDefault();
            addUser(emailInput);
          }}
        >
          <TextInput
            className="PermissionGroupsBox__editor__addUser__email"
            placeholder="grogu@example.com"
            type="email"
            value={emailInput}
            onChange={(e: any) => setEmailInput(e.target.value)}
            radius={0}
            size="xs"
            disabled={disabled}
          />
          <Button
            size="xs"
            radius={0}
            color="dark"
            type="submit"
            disabled={disabled || !emailInput.trim()}
          >
            Add user
          </Button>
        </form>
        {group.users.length > 0 && (
          <ul className="PermissionGroupsBox__editor__userList">
            {group.users.map((email) => (
              <li key={email} className="PermissionGroupsBox__editor__userItem">
                <span className="PermissionGroupsBox__editor__userItem__email">
                  {email}
                </span>
                <ActionIcon
                  size="sm"
                  variant="transparent"
                  disabled={disabled}
                  onClick={() => removeUser(email)}
                  title={`Remove ${email}`}
                >
                  <IconX size={14} />
                </ActionIcon>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="PermissionGroupsBox__editor__footer">
        <Button
          variant="subtle"
          size="xs"
          color="red"
          compact
          disabled={disabled}
          leftIcon={<IconTrash size={14} />}
          onClick={confirmDelete}
        >
          Delete group
        </Button>
      </div>
    </div>
  );
}
