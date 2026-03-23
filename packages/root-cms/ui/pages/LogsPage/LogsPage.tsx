import {ActionLogs} from '../../components/ActionLogs/ActionLogs.js';
import {Heading} from '../../components/Heading/Heading.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {Layout} from '../../layout/Layout.js';
import './LogsPage.css';

export function LogsPage() {
  usePageTitle('Action Logs');
  return (
    <Layout>
      <div className="LogsPage">
        <div className="LogsPage__header">
          <Heading size="h1">Action Logs</Heading>
        </div>
        <ActionLogs />
      </div>
    </Layout>
  );
}
