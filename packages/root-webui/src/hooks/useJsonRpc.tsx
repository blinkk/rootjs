import {useNotifications} from '@mantine/notifications';
import {useEffect} from 'react';

/**
 * useJsonRpc is a hook for fetching RPC objects at /cms/api/<endpoint>.
 *
 * On success, the hook calls a callback function with the response body.
 * Meanwhile errors are automatically logged in the UI using the notification
 * system.
 */
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
        autoClose: false,
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
