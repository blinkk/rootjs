import './TasksPage.css';

import {Button} from '@mantine/core';
import {IconAdjustmentsHorizontal} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {Heading} from '../../components/Heading/Heading.js';
import {useTaskFieldsModal} from '../../components/TaskFieldsModal/TaskFieldsModal.js';
import {TaskManager} from '../../components/TaskManager/TaskManager.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {Layout} from '../../layout/Layout.js';
import {subscribeTaskFieldDefs, TaskFieldDef} from '../../utils/tasks.js';

/** Renders the main task manager page. */
export function TasksPage() {
  usePageTitle('Tasks');
  const [fieldDefs, setFieldDefs] = useState<TaskFieldDef[]>([]);
  const taskFieldsModal = useTaskFieldsModal();

  useEffect(() => {
    const unsubscribe = subscribeTaskFieldDefs(
      (nextFieldDefs) => setFieldDefs(nextFieldDefs),
      (err) => console.error('failed to load task fields:', err)
    );
    return () => unsubscribe();
  }, []);

  return (
    <Layout>
      <div className="TasksPage">
        <div className="TasksPage__header">
          <Heading size="h1">Tasks</Heading>
          <Button
            compact
            size="xs"
            variant="default"
            leftIcon={<IconAdjustmentsHorizontal size={14} strokeWidth="1.8" />}
            onClick={() => taskFieldsModal.open({fieldDefs})}
          >
            Fields
          </Button>
        </div>
        <TaskManager variant="page" />
      </div>
    </Layout>
  );
}
