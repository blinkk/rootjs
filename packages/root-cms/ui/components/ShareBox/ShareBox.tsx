import {Button, LoadingOverlay, Select, TextInput} from '@mantine/core';
import {
  doc,
  updateDoc,
  getDoc,
  FieldPath,
  deleteField,
} from 'firebase/firestore';
import {useEffect, useState} from 'preact/hooks';
import {logAction} from '../../utils/actions.js';
import {joinClassNames} from '../../utils/classes.js';
import {notifyErrors} from '../../utils/notifications.js';
import {sortByKey} from '../../utils/objects.js';
import {Text} from '../Text/Text.js';
import './ShareBox.css';

export interface ShareBoxProps {
  className?: string;
}

type UserRole = 'ADMIN' | 'EDITOR' | 'CONTRIBUTOR' | 'VIEWER' | 'REMOVE';

function getCurrentUserRole(roles: Record<string, UserRole>) {
  const currentUser = window.firebase.user.email;
  if (!currentUser) {
    return null;
  }
  if (currentUser in roles) {
    return roles[currentUser];
  }
  const userDomain = currentUser.split('@').at(-1);
  const domainEmail = `*@${userDomain}`;
  if (domainEmail in roles) {
    return roles[domainEmail];
  }
  return null;
}

function testCurrentUserIsAdmin(roles: Record<string, UserRole>) {
  return getCurrentUserRole(roles) === 'ADMIN';
}

export function ShareBox(props: ShareBoxProps) {
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<Record<string, UserRole>>({});
  const [emailInput, setEmailInput] = useState('');
  const db = window.firebase.db;
  const projectId = window.__ROOT_CTX.rootConfig.projectId || 'default';
  const docRef = doc(db, 'Projects', projectId);

  const currentUserIsAdmin = testCurrentUserIsAdmin(roles);

  useEffect(() => {
    getDoc(docRef).then((snapshot) => {
      const data = snapshot.data() || {};
      setRoles(data.roles || {});
      setLoading(false);
    });
  }, []);

  async function updateUserRole(email: string, role: UserRole | 'REMOVE') {
    setLoading(true);
    await notifyErrors(async () => {
      if (role === 'REMOVE') {
        await updateDoc(docRef, new FieldPath('roles', email), deleteField());
        setRoles((current) => {
          const newValue = {...current};
          delete newValue[email];
          return newValue;
        });
        logAction('acls.remove_user', {metadata: {user: email}});
      } else {
        await updateDoc(docRef, new FieldPath('roles', email), role);
        setRoles((current) => {
          return {
            ...current,
            [email]: role,
          };
        });
        logAction('acls.update_user', {metadata: {user: email, role}});
      }
    });
    setLoading(false);
  }

  async function addUser(email: string) {
    setEmailInput('');
    setLoading(true);
    await notifyErrors(async () => {
      await updateDoc(docRef, new FieldPath('roles', email), 'EDITOR');
      setRoles((current) => {
        return {
          ...current,
          [email]: 'VIEWER',
        };
      });
    });
    logAction('acls.add_user', {metadata: {user: email, role: 'VIEWER'}});
    setLoading(false);
  }

  const users: ShareBoxUserProps[] = sortByKey(
    Object.keys(roles).map((email) => {
      return {email, role: roles[email]};
    }),
    'email'
  );

  return (
    <div className={joinClassNames(props.className, 'ShareBox')}>
      {loading && (
        <LoadingOverlay
          visible={true}
          loaderProps={{color: 'gray', size: 'xl'}}
        />
      )}
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
          onChange={(e) => setEmailInput(e.target.value)}
          radius={0}
          size="xs"
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
            onChange={updateUserRole}
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
  onChange: (email: string, newRole: UserRole) => void;
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
          onChange={(role: string) => {
            props.onChange(props.email, role as UserRole | 'REMOVE');
          }}
        />
      </div>
    </div>
  );
};
