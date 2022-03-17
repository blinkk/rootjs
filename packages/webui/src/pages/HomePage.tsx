import {Button, Group} from '@mantine/core';
import {useNotifications} from '@mantine/notifications';
import styles from './HomePage.module.sass';

export function HomePage() {
  const notifications = useNotifications();

  return (
    <div className={styles.HomePage}>
      <Group position="center">
        <Button
          onClick={() =>
            notifications.showNotification({
              title: 'Default notification',
              message: 'Hey there, your code is awesome! 🤥',
            })
          }
        >
          Show notification
        </Button>
      </Group>
    </div>
  );
}
