import {useNotifications} from '@mantine/notifications';
import {useEffect} from 'react';

export function useJsonRpc<T>(endpoint: string, callback: (data: T) => void) {
  const notifications = useNotifications();

  const callJsonRpc = async () => {
    const res = await fetch(`/cms/api/${endpoint}`);
    if (res.status !== 200) {
      const text = await res.text();
      notifications.showNotification({
        title: `Failed: ${endpoint}`,
        message: `Error: ${text}`,
        color: 'red',
      });
      return;
    }

    const data = (await res.json()) as T;
    callback(data);
  };

  useEffect(() => {
    callJsonRpc();
  }, []);
}
