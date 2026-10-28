import './TasksPage.css';

import {Layout} from '../../../../app/layout/Layout.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {TaskManager} from '../../components/TaskManager/TaskManager.js';

/** Renders the main task manager page. */
export function TasksPage() {
  usePageTitle('Tasks');
  return (
    <Layout>
      <div className="TasksPage">
        <div className="TasksPage__header">
          <Heading size="h1">Tasks</Heading>
        </div>
        <TaskManager variant="page" />
      </div>
    </Layout>
  );
}
