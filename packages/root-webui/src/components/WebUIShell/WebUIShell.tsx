import firebase from 'firebase/compat/app';
import {
  ActionIcon,
  Avatar,
  Group,
  Menu,
  Stack,
  Sx,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import {Link, useNavigate} from 'react-router-dom';
import {useProject} from '../../hooks/useProject';
import {useUser} from '../../hooks/useUser';
import styles from './WebUIShell.module.scss';
import {MaterialIcon} from '../../icons/MaterialIcon';

interface WebUIShellProps {
  header?: React.ReactNode;
  children: React.ReactNode;
  sx?: Sx;
}

export function WebUIShell(props: WebUIShellProps) {
  return (
    <Group spacing={0} align="flex-start" grow sx={props.sx}>
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
  const project = useProject();
  const navigate = useNavigate();
  return (
    <div className={styles.sidebar}>
      <div className={styles.logoWrap}>
        <Link to="/cms">
          <div className={styles.logo} />
        </Link>
      </div>
      <Stack className={styles.sidebarMain} align="center" justify="flex-end">
        <Stack>
          <Tooltip label="Project Home" position="right" withArrow>
            <ActionIcon onClick={() => navigate(`/cms/${project.id}`)}>
              <MaterialIcon icon="home" />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Content" position="right" withArrow>
            <ActionIcon onClick={() => navigate(`/cms/${project.id}/content`)}>
              <MaterialIcon icon="folder" />
            </ActionIcon>
          </Tooltip>
        </Stack>
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
  return (
    <div className={styles.header}>
      <div className={styles.headerTitle}>Root.js CMS</div>
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
