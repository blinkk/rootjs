import {useState} from 'preact/hooks';
import {useGapiClient} from '../../integrations/useGapiClient.js';
import {
  showNotification,
  updateNotification,
} from '../../primitives/Toast/toastStore.js';
import {DataSource, publishDataSource, syncDataSource} from './data-source.js';

export type DataSourceAction = 'sync' | 'publish';

/**
 * Runs a data source's sync or publish action, showing progress and the
 * result in a toast. Signs in to Google first when syncing a Google Sheet.
 *
 * ```tsx
 * const sync = useDataSourceAction(dataSource, 'sync', () => reload());
 * <Button loading={sync.loading} onClick={sync.run}>Sync</Button>
 * ```
 */
export function useDataSourceAction(
  dataSource: DataSource,
  action: DataSourceAction,
  onSuccess?: () => void
) {
  const [loading, setLoading] = useState(false);
  const gapiClient = useGapiClient();

  async function run() {
    setLoading(true);
    const notificationId = `data-source-${action}-${dataSource.id}`;
    showNotification({
      id: notificationId,
      loading: true,
      title: `Running Data Source ${action}`,
      message: `Updating ${dataSource.id}...`,
      autoClose: false,
      disallowClose: true,
    });
    try {
      if (action === 'sync') {
        // The gsheet "sync" action requires a gapi access token, so ensure the
        // user has a token before syncing.
        if (dataSource.type === 'gsheet' && !gapiClient.isLoggedIn()) {
          await gapiClient.login();
        }
        await syncDataSource(dataSource.id);
      } else {
        await publishDataSource(dataSource.id);
      }
      setLoading(false);
      onSuccess?.();
      updateNotification({
        id: notificationId,
        title: 'Success',
        message: `Updated Data Source ${dataSource.id}`,
        autoClose: false,
      });
    } catch (err: any) {
      console.error(err);
      let msg = err;
      if (typeof err === 'object' && err.body) {
        msg = String(err.body);
      }
      setLoading(false);
      updateNotification({
        id: notificationId,
        title: `Data Source ${action} failed`,
        message: String(msg),
        color: 'red',
        autoClose: false,
      });
    }
  }

  return {loading, run};
}
