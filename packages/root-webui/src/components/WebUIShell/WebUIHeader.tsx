import firebase from 'firebase/compat/app';
import {Avatar, Header, Menu, Text, UnstyledButton} from '@mantine/core';
import {useUser} from '../../hooks/useUser';
import styles from './WebUIHeader.module.scss';

function getInitials(user: firebase.User): string {
  if (user.displayName && user.displayName.includes(' ')) {
    const parts = user.displayName.split(' ');
    const firstInitial = parts[0][0];
    const lastInitial = parts[parts.length - 1][0];
    return `${firstInitial}${lastInitial}`;
  }
  return user.email![0].toUpperCase();
}

function UserAvatar(props: {user: firebase.User}) {
  const user = props.user;
  const initials = getInitials(user);
  return (
    <Avatar color="cyan" size="md" radius="xl" title={user.email || ''}>
      {initials}
    </Avatar>
  );
}

export function WebUIHeader() {
  const user = useUser();
  return (
    <Header height={60} px="md">
      <div className={styles.content}>
        <Text weight={700}>Blinkk CMS</Text>
        <Menu
          control={
            <UnstyledButton>
              <UserAvatar user={user} />
            </UnstyledButton>
          }
          gutter={10}
        >
          <Menu.Item onClick={() => alert('coming soon')}>Sign Out</Menu.Item>
        </Menu>
      </div>
    </Header>
  );
}
