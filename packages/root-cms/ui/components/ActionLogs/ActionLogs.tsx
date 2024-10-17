import {Button, Loader, Table, Tooltip} from '@mantine/core';
import {Timestamp} from 'firebase/firestore';
import {useEffect, useState} from 'preact/hooks';
import {Action, listActions} from '@/db/actions.js';
import {getSpreadsheetUrl} from '@/utils/gsheets.js';
import {stringifyObj} from '@/utils/objects.js';
import './ActionsLogs.css';

export interface ActionLogsProps {
  className?: string;
  limit?: number;
}

export function ActionLogs(props: ActionLogsProps) {
  const limit = props.limit || 40;
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<Action[]>([]);

  async function init() {
    const actions = await listActions({limit});
    setActions(actions);
    setLoading(false);
  }

  useEffect(() => {
    init();
  }, []);

  if (loading) {
    return (
      <div className="ActionsLog ActionsLog--loading">
        <Loader color="gray" size="xl" />
      </div>
    );
  }

  return (
    <div className="ActionsLog">
      <Table className="ActionsLog__table">
        <thead>
          <tr className="ActionsLogs__table__row ActionsLogs__table__row--header">
            <th className="ActionsLogs__table__header">timestamp</th>
            <th className="ActionsLogs__table__header">user</th>
            <th className="ActionsLogs__table__header">action</th>
            <th className="ActionsLogs__table__header">quick links</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((action) => (
            <tr className="ActionsLogs__table__row">
              <td className="ActionsLogs__table__col ActionsLogs__table__col--nowrap">
                {formatDate(action.timestamp)}
              </td>
              <td className="ActionsLogs__table__col ActionsLogs__table__col--nowrap">
                {action.by}
              </td>
              <td className="ActionsLogs__table__col">
                {action.action} {stringifyObj(action.metadata)}
              </td>
              <td className="ActionsLogs__table__col">
                <div className="ActionsLogs__table__buttons">
                  {action.action !== 'doc.delete' && action.metadata?.docId && (
                    <Tooltip transition="pop" label={action.metadata.docId}>
                      <Button
                        component="a"
                        variant="default"
                        size="xs"
                        compact
                        href={`/cms/content/${action.metadata?.docId}`}
                      >
                        Open doc
                      </Button>
                    </Tooltip>
                  )}
                  {action.action !== 'datasource.delete' &&
                    action.metadata?.datasourceId && (
                      <Tooltip
                        transition="pop"
                        label={action.metadata.datasourceId}
                      >
                        <Button
                          component="a"
                          variant="default"
                          size="xs"
                          compact
                          href={`/cms/data/${action.metadata?.datasourceId}`}
                        >
                          Open release
                        </Button>
                      </Tooltip>
                    )}
                  {action.action !== 'release.delete' &&
                    action.metadata?.releaseId && (
                      <Tooltip
                        transition="pop"
                        label={action.metadata.releaseId}
                      >
                        <Button
                          component="a"
                          variant="default"
                          size="xs"
                          compact
                          href={`/cms/releases/${action.metadata?.releaseId}`}
                        >
                          Open release
                        </Button>
                      </Tooltip>
                    )}
                  {action.metadata?.sheetId && (
                    <Button
                      component="a"
                      variant="default"
                      size="xs"
                      compact
                      href={getSpreadsheetUrl(action.metadata.sheetId)}
                      target="_blank"
                    >
                      Open sheet
                    </Button>
                  )}
                  {action.action.startsWith('acls.') && (
                    <Button
                      component="a"
                      variant="default"
                      size="xs"
                      compact
                      href="/cms/settings"
                    >
                      Open settings
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function formatDate(timestamp: Timestamp) {
  const date = timestamp.toDate();
  return date.toLocaleString('sv-SE', {
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}
