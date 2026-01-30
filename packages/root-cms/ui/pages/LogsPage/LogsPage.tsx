import {ActionLogs} from '../../components/ActionLogs/ActionLogs.js';
import {Heading} from '../../components/Heading/Heading.js';
import {Layout} from '../../layout/Layout.js';
import './LogsPage.css';

export function LogsPage() {
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

function firebaseUrl() {
  const firebaseConfig = window.__ROOT_CTX.firebaseConfig;
  const gcpProject = firebaseConfig.projectId;
  const rootProject = window.__ROOT_CTX.rootConfig.projectId;
  const databaseId = firebaseConfig.databaseId || '-default-';
  const logsPath = `/Projects/${rootProject}/ActionLogs`.replaceAll('/', '~2F');
  return `https://console.firebase.google.com/project/${gcpProject}/firestore/databases/${databaseId}/data/${logsPath}`;
}
