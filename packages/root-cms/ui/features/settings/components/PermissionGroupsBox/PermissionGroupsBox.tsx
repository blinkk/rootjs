import {IconTrash, IconX} from '@tabler/icons-preact';
import {useMemo, useState} from 'preact/hooks';
import {UserRole} from '../../../../../core/client.js';
import {Text} from '../../../../components/Text/Text.js';
import {
  Accordion,
  AccordionItem,
} from '../../../../primitives/Accordion/Accordion.js';
import {Badge} from '../../../../primitives/Badge/Badge.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {MultiSelect} from '../../../../primitives/MultiSelect/MultiSelect.js';
import {Select} from '../../../../primitives/Select/Select.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {cn} from '../../../../utils/classes.js';
import {EmailAvatar} from '../../../users/EmailAvatar/EmailAvatar.js';
import {UserProfile, isOrgEmail} from '../../../users/user-profile.js';
import {useUserProfiles} from '../../../users/useUserProfile.js';
import {PermissionGroup, newPermissionGroup} from '../../permissionGroups.js';

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

  // Controlled accordion state (open group ids) so newly-added groups can be
  // opened automatically.
  const [openGroups, setOpenGroups] = useState<string[]>([]);

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
    const group = newPermissionGroup({name: 'New group'});
    onChange([...groups, group]);
    setOpenGroups((prev) => [...prev, group.id]);
  }

  return (
    <div
      className={cn(
        'PermissionGroupsBox relative flex flex-col gap-3',
        props.className
      )}
    >
      {groups.length === 0 ? (
        <div className="PermissionGroupsBox__empty rounded-sm border border-dashed border-border p-4">
          <Text size="body-sm" weight="semi-bold" color="gray">
            No permission groups yet. Create one to organize users by role and
            optionally scope access to specific collections.
          </Text>
        </div>
      ) : (
        <Accordion
          className="PermissionGroupsBox__accordion rounded-sm border border-border bg-surface *:last:border-b-0"
          chevronPosition="left"
          multiple
          value={openGroups}
          onChange={setOpenGroups}
        >
          {groups.map((group) => (
            <AccordionItem
              key={group.id}
              value={group.id}
              label={
                <div className="PermissionGroupsBox__trigger flex w-full min-w-0 items-center justify-between gap-3 pr-2 text-base">
                  <span className="PermissionGroupsBox__trigger__name min-w-0 truncate font-semibold">
                    {group.name || 'Untitled group'}
                  </span>
                  <Badge
                    size="xs"
                    className="PermissionGroupsBox__trigger__badge shrink-0"
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
            </AccordionItem>
          ))}
        </Accordion>
      )}
      <div className="PermissionGroupsBox__addGroup flex justify-start">
        <Button disabled={disabled} onClick={addGroup}>
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
  const profileEmails = group.users.filter((email) => !isOrgEmail(email));
  const {profiles} = useUserProfiles(profileEmails);

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
    <div className="PermissionGroupsBox__editor flex flex-col gap-3.5 pt-1 pb-2">
      <div className="PermissionGroupsBox__editor__row flex flex-col gap-3 sm:flex-row sm:items-end">
        <TextInput
          className="PermissionGroupsBox__editor__name min-w-0 flex-1"
          label="Group name"
          placeholder="e.g. Blog Post Editors"
          value={group.name}
          disabled={disabled}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <Select
          className="PermissionGroupsBox__editor__role sm:w-40 sm:shrink-0"
          label="Role"
          data={ROLE_OPTIONS}
          value={group.role}
          disabled={disabled}
          onValueChange={(role) => {
            if (role) {
              setRole(role as UserRole);
            }
          }}
        />
      </div>
      <MultiSelect
        className="PermissionGroupsBox__editor__collections"
        label="Collections"
        description="Leave empty to apply project-wide. Otherwise restrict the group's role to the selected collections."
        data={collectionOptions}
        value={group.collections}
        clearable
        placeholder="All collections (project-wide)"
        disabled={disabled}
        onValueChange={(value) => setCollections(value)}
      />
      <div className="PermissionGroupsBox__editor__users flex flex-col gap-2">
        <Text size="body-sm" weight="semi-bold">
          Users
        </Text>
        <form
          className="PermissionGroupsBox__editor__addUser flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addUser(emailInput);
          }}
        >
          <TextInput
            className="PermissionGroupsBox__editor__addUser__email min-w-0 flex-1"
            aria-label="Email to add"
            placeholder="grogu@example.com"
            type="email"
            value={emailInput}
            onInput={(e) => setEmailInput(e.currentTarget.value)}
            disabled={disabled}
          />
          <Button
            variant="primary"
            type="submit"
            disabled={disabled || !emailInput.trim()}
          >
            Add user
          </Button>
        </form>
        {group.users.length > 0 && (
          <ul className="PermissionGroupsBox__editor__userList m-0 flex max-h-60 list-none flex-col divide-y divide-border overflow-auto rounded-sm border border-border p-0">
            {group.users.map((email) => {
              const profile: UserProfile | null =
                profiles.get(email.toLowerCase()) || null;
              return (
                <li
                  key={email}
                  className="PermissionGroupsBox__editor__userItem flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-hover"
                >
                  <EmailAvatar
                    className="PermissionGroupsBox__editor__userItem__avatar size-6"
                    email={email}
                    profile={profile}
                    size={24}
                  />
                  <span className="PermissionGroupsBox__editor__userItem__email min-w-0 flex-1 truncate">
                    {email}
                  </span>
                  <IconButton
                    size="xs"
                    label={`Remove ${email}`}
                    disabled={disabled}
                    onClick={() => removeUser(email)}
                  >
                    <IconX />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="PermissionGroupsBox__editor__footer flex justify-end border-t border-border pt-2">
        <Button
          variant="subtle"
          size="xs"
          className="text-danger"
          disabled={disabled}
          icon={<IconTrash />}
          onClick={confirmDelete}
        >
          Delete group
        </Button>
      </div>
    </div>
  );
}
