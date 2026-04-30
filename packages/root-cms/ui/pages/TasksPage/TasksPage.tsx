import './TasksPage.css';

import {Heading} from '../../components/Heading/Heading.js';
import {TaskManager} from '../../components/TaskManager/TaskManager.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {Layout} from '../../layout/Layout.js';

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
