import firebase from 'firebase/compat/app';
import {Avatar, Header, Text} from '@mantine/core';
import {useUser} from '../hooks/useUser';
import styles from './AppHeader.module.sass';

function getInitials(user: firebase.User): string {
  if (user.displayName && user.displayName.includes(' ')) {
    const parts = user.displayName.split(' ');
    const firstInitial = parts[0][0];
    const lastInitial = parts[parts.length - 1][0];
    return `${firstInitial}${lastInitial}`;
  }
  return user.email![0].toUpperCase();
}

export function AppHeader() {
  const user = useUser();
  const initials = getInitials(user);
  return (
    <Header height={70} p="md">
      <div className={styles.AppHeader_Contents}>
        <Text weight={700}>Blinkk CMS</Text>
        <Avatar color="cyan" size="md" radius="xl" title={user.email || ''}>
          {initials}
        </Avatar>
      </div>
    </Header>
  );
}
