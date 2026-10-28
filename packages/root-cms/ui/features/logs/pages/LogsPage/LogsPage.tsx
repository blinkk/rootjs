import {Layout} from '../../../../app/layout/Layout.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {ActionLogs} from '../../components/ActionLogs/ActionLogs.js';

export function LogsPage() {
  usePageTitle('Action Logs');
  return (
    <Layout>
      <div className="LogsPage bg-page p-page">
        <div className="LogsPage__header mb-8 flex flex-wrap items-center justify-between gap-4">
          <Heading size="h1">Action Logs</Heading>
          <Button href="/cms/logs/errors" variant="default" size="sm">
            View error logs
          </Button>
        </div>
        <ActionLogs />
      </div>
    </Layout>
  );
}
