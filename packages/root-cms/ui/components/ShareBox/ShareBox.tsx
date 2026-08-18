import {ActionIcon, Button, Select, TextInput, Tooltip} from '@mantine/core';
import {IconKeyOff} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';
import {UserRole} from '../../../core/client.js';
import {useSignInStatuses} from '../../hooks/useSignInStatus.js';
import {useUserProfiles} from '../../hooks/useUserProfile.js';
import {joinClassNames} from '../../utils/classes.js';
import {sortByKey} from '../../utils/objects.js';
import {UserProfile, isOrgEmail} from '../../utils/user-profile.js';
import {EmailAvatar} from '../EmailAvatar/EmailAvatar.js';
import {Text} from '../Text/Text.js';
import './ShareBox.css';

export interface ShareBoxProps {
  className?: string;
  roles: Record<string, UserRole>;
  onChange: (roles: Record<string, UserRole>) => void;
  currentUserIsAdmin: boolean;
  /**
   * Called when an admin resets a user's sign-in. Omit to hide the action.
   */
  onResetSignIn?: (email: string) => void;
}

export function ShareBox(props: ShareBoxProps) {
  const {roles, onChange, currentUserIsAdmin, onResetSignIn} = props;
  const [emailInput, setEmailInput] = useState('');
  const profileEmails = Object.keys(roles).filter(
    (email) => !isOrgEmail(email)
  );
  const {profiles} = useUserProfiles(profileEmails);
  // Only admins can reset a sign-in, and only accounts that actually have a
  // Google link have anything to reset.
  const {statuses} = useSignInStatuses(profileEmails, {
    enabled: currentUserIsAdmin && !!onResetSignIn,
  });

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
        hasGoogleLink: !!statuses.get(email.toLowerCase())?.hasGoogleLink,
      };
    }),
    'email'
  );

  return (
    <div className={joinClassNames(props.className, 'ShareBox')}>
      <form
        className="ShareBox__addUser"
        onSubmit={(e) => {
          e.preventDefault();
          addUser(emailInput);
        }}
      >
        <TextInput
          className="ShareBox__addUser__email"
          placeholder="grogu@example.com"
          type="email"
          value={emailInput}
          onChange={(e: any) => setEmailInput(e.target.value)}
          radius={0}
          size="xs"
          disabled={!currentUserIsAdmin}
        />
        <Button
          className="ShareBox__addUser__button"
          size="xs"
          radius={0}
          color="dark"
          type="submit"
          disabled={!currentUserIsAdmin}
        >
          Add user
        </Button>
      </form>
      <div className="ShareBox__users">
        {users.map((user) => (
          <ShareBox.User
            key={user.email}
            {...user}
            currentUserIsAdmin={currentUserIsAdmin}
            onRoleChange={setRole}
            onRemove={removeUser}
            onResetSignIn={onResetSignIn}
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
  /** True if the user has a Google sign-in link that could be reset. */
  hasGoogleLink?: boolean;
  onRoleChange: (email: string, newRole: UserRole) => void;
  onRemove: (email: string) => void;
  onResetSignIn?: (email: string) => void;
}

ShareBox.User = (props: ShareBoxUserProps) => {
  const isCurrentUser = props.email === window.firebase.user.email;
  // Hidden unless there's a Google link to unlink. Domain-wide entries
  // (`*@example.com`) and users who have never signed in don't have one.
  const canResetSignIn =
    !!props.onResetSignIn &&
    props.currentUserIsAdmin &&
    !isOrgEmail(props.email) &&
    !!props.hasGoogleLink;
  return (
    <div className="ShareBox__user">
      <EmailAvatar
        className="ShareBox__user__avatar"
        email={props.email}
        profile={props.profile}
        size={24}
      />
      <Text
        className="ShareBox__user__email"
        size="body-sm"
        weight="semi-bold"
        color="gray"
      >
        {props.email}
        {isCurrentUser && ' (you)'}
      </Text>
      <div className="ShareBox__user__actions">
        {canResetSignIn && (
          <Tooltip
            label="Reset sign-in"
            withArrow
            transition="pop"
            position="left"
          >
            <ActionIcon
              className="ShareBox__user__resetSignIn"
              size="sm"
              radius={0}
              variant="subtle"
              color="dark"
              aria-label={`Reset sign-in for ${props.email}`}
              onClick={() => props.onResetSignIn!(props.email)}
            >
              <IconKeyOff size={16} strokeWidth={1.75} />
            </ActionIcon>
          </Tooltip>
        )}
      </div>
      <div className="ShareBox__user__roleSelect">
        <Select
          data={[
            {value: 'ADMIN', label: 'ADMIN'},
            {value: 'EDITOR', label: 'EDITOR'},
            {value: 'CONTRIBUTOR', label: 'CONTRIBUTOR'},
            {value: 'VIEWER', label: 'VIEWER'},
            {value: 'REMOVE', label: 'REMOVE'},
          ]}
          value={props.role}
          radius={0}
          size="xs"
          disabled={isCurrentUser || !props.currentUserIsAdmin}
          onChange={(value: string) => {
            if (value === 'REMOVE') {
              props.onRemove(props.email);
            } else {
              props.onRoleChange(props.email, value as UserRole);
            }
          }}
        />
      </div>
    </div>
  );
};
