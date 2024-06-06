import {ActionLogs} from '../../components/ActionLogs/ActionLogs.js';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {Layout} from '../../layout/Layout.js';
import './LogsPage.css';

const LIMIT = 250;

export function LogsPage() {
  return (
    <Layout>
      <div className="LogsPage">
        <div className="LogsPage__header">
          <Heading size="h1">Action Logs</Heading>
          <Text as="p">
            The latest {LIMIT} actions are displayed here. View all past actions
            in the{' '}
            <a href={firebaseUrl()} target="_blank">
              Firebase Console
            </a>
            .
          </Text>
        </div>
        <ActionLogs limit={LIMIT} />
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
