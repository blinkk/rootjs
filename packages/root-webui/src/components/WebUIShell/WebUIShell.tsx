import firebase from 'firebase/compat/app';
import {Avatar, Group, Menu, Stack, UnstyledButton} from '@mantine/core';
import {Link} from 'react-router-dom';
import {useProject} from '../../hooks/useProject';
import {useUser} from '../../hooks/useUser';
import styles from './WebUIShell.module.scss';

interface WebUIShellProps {
  header?: React.ReactNode;
  children: React.ReactNode;
}

export function WebUIShell(props: WebUIShellProps) {
  return (
    <Group spacing={0} align="flex-start" grow>
      <WebUIShell.Sidebar />
      <WebUIShell.Content>
        {props.header ? props.header : <WebUIShell.Header></WebUIShell.Header>}
        {props.children}
      </WebUIShell.Content>
    </Group>
  );
}

WebUIShell.Sidebar = () => {
  const user = useUser();
  return (
    <div className={styles.sidebar}>
      <div className={styles.logoWrap}>
        <Link to="/cms">
          <div className={styles.logo} />
        </Link>
      </div>
      <Stack className={styles.sidebarMain} align="center" justify="flex-end">
        <div></div>
        <div className={styles.avatarWrap}>
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
      </Stack>
    </div>
  );
};

interface WebUIShellContentProps {
  children: React.ReactNode;
}

WebUIShell.Content = (props: WebUIShellContentProps) => {
  return <div className={styles.content}>{props.children}</div>;
};

type WebUIShellHeaderProps = {};

WebUIShell.Header = (props: WebUIShellHeaderProps) => {
  const project = useProject();
  return (
    <div className={styles.header}>
      <div className={styles.headerTitle}>{project.name || project.id}</div>
    </div>
  );
};

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
