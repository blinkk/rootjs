import {useNotifications} from '@mantine/notifications';
import firebase from 'firebase/compat/app';

interface Response<T> {
  data: T;
}

/**
 * useJsonRpc is a hook for fetching RPC objects at /cms/api/<endpoint>.
 *
 * On success, the hook calls a callback function with the response body.
 * Meanwhile errors are automatically logged in the UI using the notification
 * system.
 */
export function useJsonRpc() {
  const notifications = useNotifications();
  return {
    fetch: async <T>(endpoint: string, body?: any) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (firebase.apps.length > 0) {
        const auth = firebase.auth();
        const user = auth.currentUser;
        const token = user && (await user.getIdToken());
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        console.log(headers);
      }
      const res = await fetch(`/cms/api/${endpoint}`, {
        headers: headers,
        method: 'POST',
        body: JSON.stringify(body || {}),
      });
      if (res.status !== 200) {
        const text = await res.text();
        notifications.showNotification({
          title: `Failed: ${endpoint}`,
          message: `Error: ${text}`,
          color: 'red',
          autoClose: false,
        });
        throw new Error(text);
      }
      const resData = (await res.json()) as Response<T>;
      return resData.data;
    },
  };
}
