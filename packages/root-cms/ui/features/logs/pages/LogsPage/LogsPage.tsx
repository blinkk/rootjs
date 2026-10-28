import {Button} from '@mantine/core';
import {Layout} from '../../../../app/layout/Layout.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {ActionLogs} from '../../components/ActionLogs/ActionLogs.js';
import './LogsPage.css';

export function LogsPage() {
  usePageTitle('Action Logs');
  return (
    <Layout>
      <div className="LogsPage">
        <div className="LogsPage__header">
          <Heading size="h1">Action Logs</Heading>
          <Button
            component="a"
            href="/cms/logs/errors"
            variant="default"
            size="xs"
          >
            View error logs
          </Button>
        </div>
        <ActionLogs />
      </div>
    </Layout>
  );
}
