import {IconCheck, IconChevronDown} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';
import {UserRole} from '../../../../../core/client.js';
import {RelativeTime} from '../../../../components/RelativeTime/RelativeTime.js';
import {Text} from '../../../../components/Text/Text.js';
import {Badge} from '../../../../primitives/Badge/Badge.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Menu, MenuDivider, MenuItem} from '../../../../primitives/Menu/Menu.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {cn} from '../../../../utils/classes.js';
import {sortByKey} from '../../../../utils/objects.js';
import {timestampToMillis} from '../../../../utils/time.js';
import {EmailAvatar} from '../../../users/EmailAvatar/EmailAvatar.js';
import {UserProfile, isOrgEmail} from '../../../users/user-profile.js';
import {useUserProfiles} from '../../../users/useUserProfile.js';

/** The roles offered in a user's role menu, highest access first. */
const ROLE_OPTIONS: {role: UserRole; description: string}[] = [
  {role: 'ADMIN', description: 'All of the below and change sharing settings'},
  {role: 'EDITOR', description: 'View, edit, and publish docs'},
  {role: 'CONTRIBUTOR', description: 'View and edit docs, but not publish'},
  {role: 'VIEWER', description: 'View docs but not edit'},
];

export interface ShareBoxProps {
  className?: string;
  roles: Record<string, UserRole>;
  onChange: (roles: Record<string, UserRole>) => void;
  currentUserIsAdmin: boolean;
}

export function ShareBox(props: ShareBoxProps) {
  const {roles, onChange, currentUserIsAdmin} = props;
  const [emailInput, setEmailInput] = useState('');
  const profileEmails = Object.keys(roles).filter(
    (email) => !isOrgEmail(email)
  );
  const {profiles} = useUserProfiles(profileEmails);

  function setRole(email: string, role: UserRole) {
    onChange({...roles, [email]: role});
  }

  function removeUser(email: string) {
    const next = {...roles};
    delete next[email];
    onChange(next);
  }

  function addUser(email: string) {
    const trimmed = email.trim();
    setEmailInput('');
    if (!trimmed || trimmed in roles) {
      return;
    }
    onChange({...roles, [trimmed]: 'EDITOR'});
  }

  const users: ShareBoxUserProps[] = sortByKey(
    Object.keys(roles).map((email) => {
      return {
        email,
        role: roles[email],
        profile: profiles.get(email.toLowerCase()) || null,
      };
    }),
    'email'
  );

  return (
    <div className={cn('ShareBox relative min-h-30', props.className)}>
      <form
        className="ShareBox__addUser flex w-full items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addUser(emailInput);
        }}
      >
        <TextInput
          className="ShareBox__addUser__email min-w-0 flex-1"
          aria-label="Email to add"
          placeholder="grogu@example.com"
          type="email"
          value={emailInput}
          onInput={(e) => setEmailInput(e.currentTarget.value)}
          disabled={!currentUserIsAdmin}
        />
        <Button
          className="ShareBox__addUser__button w-30"
          variant="primary"
          type="submit"
          disabled={!currentUserIsAdmin}
        >
          Add user
        </Button>
      </form>
      <div className="ShareBox__users mt-3 flex max-h-160 flex-col overflow-auto rounded-sm border border-border py-2.5">
        {users.map((user) => (
          <ShareBox.User
            key={user.email}
            {...user}
            currentUserIsAdmin={currentUserIsAdmin}
            onRoleChange={setRole}
            onRemove={removeUser}
          />
        ))}
      </div>
    </div>
  );
}

export interface ShareBoxUserProps {
  email: string;
  role: UserRole;
  profile?: UserProfile | null;
  currentUserIsAdmin: boolean;
  onRoleChange: (email: string, newRole: UserRole) => void;
  onRemove: (email: string) => void;
}

ShareBox.User = (props: ShareBoxUserProps) => {
  const isCurrentUser = props.email === window.firebase.user.email;
  const displayName = props.profile?.displayName?.trim();
  const lastLogin = timestampToMillis(props.profile?.lastSignedInAt);
  return (
    <div className="ShareBox__user flex w-full items-center gap-2 px-3 py-1.5 hover:bg-surface-hover md:px-4">
      <EmailAvatar
        className="ShareBox__user__avatar size-6 shrink-0"
        email={props.email}
        profile={props.profile}
        size={24}
      />
      <div className="ShareBox__user__info min-w-0 flex-1">
        <div className="ShareBox__user__title flex min-w-0 items-center gap-1.5">
          <Text
            className={cn(
              'min-w-0 truncate',
              displayName ? 'ShareBox__user__name' : 'ShareBox__user__email'
            )}
            size="body-sm"
            weight="semi-bold"
            color="gray"
          >
            {displayName || props.email}
          </Text>
          {isCurrentUser && (
            <Badge className="ShareBox__user__youBadge" size="xs">
              You
            </Badge>
          )}
        </div>
        {(displayName || lastLogin > 0) && (
          <Text
            className="ShareBox__user__details flex min-w-0 gap-1"
            size="body-sm"
            color="gray"
          >
            {displayName && (
              <span className="ShareBox__user__email min-w-0 truncate">
                {props.email}
              </span>
            )}
            {lastLogin > 0 && (
              <span className="ShareBox__user__lastLogin shrink-0 whitespace-nowrap">
                {displayName && '· '}Last login{' '}
                <RelativeTime ts={lastLogin} underline={false} />
              </span>
            )}
          </Text>
        )}
      </div>
      <div className="ShareBox__user__roleSelect w-36 shrink-0">
        <Menu
          placement="bottom-end"
          width={280}
          trigger={
            <Button
              className="w-full justify-between font-normal"
              aria-label={`Role for ${props.email}: ${props.role}`}
              iconRight={<IconChevronDown />}
              disabled={isCurrentUser || !props.currentUserIsAdmin}
            >
              {props.role}
            </Button>
          }
        >
          {ROLE_OPTIONS.map(({role, description}) => (
            <MenuItem
              key={role}
              hint={role === props.role ? <IconCheck /> : undefined}
              onClick={() => props.onRoleChange(props.email, role)}
            >
              <span className="block font-semibold">{role}</span>
              <span className="mt-0.5 block text-muted">{description}</span>
            </MenuItem>
          ))}
          <MenuDivider />
          <MenuItem danger onClick={() => props.onRemove(props.email)}>
            Remove access
          </MenuItem>
        </Menu>
      </div>
    </div>
  );
};
