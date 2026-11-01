import {useState} from 'preact/hooks';
import {UserRole} from '../../../../../core/client.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {cn} from '../../../../utils/classes.js';
import {sortByKey} from '../../../../utils/objects.js';
import {UserProfile, isOrgEmail} from '../../../users/user-profile.js';
import {UserInfo} from '../../../users/UserInfo/UserInfo.js';
import {useUserProfiles} from '../../../users/useUserProfile.js';
import {RoleMenu} from '../RoleMenu/RoleMenu.js';

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
  return (
    <div className="ShareBox__user flex w-full items-center gap-2 px-3 py-1.5 hover:bg-surface-hover md:px-4">
      <UserInfo
        classNames={{
          avatar: 'ShareBox__user__avatar',
          email: 'ShareBox__user__email',
        }}
        email={props.email}
        profile={props.profile}
      />
      <RoleMenu
        className="ShareBox__user__roleSelect w-36 shrink-0"
        role={props.role}
        aria-label={`Role for ${props.email}: ${props.role}`}
        disabled={isCurrentUser || !props.currentUserIsAdmin}
        onChange={(role) => props.onRoleChange(props.email, role)}
        onRemove={() => props.onRemove(props.email)}
      />
    </div>
  );
};
