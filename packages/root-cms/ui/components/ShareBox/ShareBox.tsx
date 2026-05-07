import {Button, Select, TextInput} from '@mantine/core';
import {useState} from 'preact/hooks';
import {UserRole} from '../../../core/client.js';
import {joinClassNames} from '../../utils/classes.js';
import {sortByKey} from '../../utils/objects.js';
import {Text} from '../Text/Text.js';
import './ShareBox.css';

export interface ShareBoxProps {
  className?: string;
  roles: Record<string, UserRole>;
  onChange: (roles: Record<string, UserRole>) => void;
  currentUserIsAdmin: boolean;
}

export function ShareBox(props: ShareBoxProps) {
  const {roles, onChange, currentUserIsAdmin} = props;
  const [emailInput, setEmailInput] = useState('');

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
      return {email, role: roles[email]};
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
          />
        ))}
      </div>
    </div>
  );
}

export interface ShareBoxUserProps {
  email: string;
  role: UserRole;
  currentUserIsAdmin: boolean;
  onRoleChange: (email: string, newRole: UserRole) => void;
  onRemove: (email: string) => void;
}

ShareBox.User = (props: ShareBoxUserProps) => {
  const isCurrentUser = props.email === window.firebase.user.email;
  return (
    <div className="ShareBox__user">
      <Text
        className="ShareBox__user__email"
        size="body-sm"
        weight="semi-bold"
        color="gray"
      >
        {props.email}
        {isCurrentUser && ' (you)'}
      </Text>
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
