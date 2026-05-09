import './SubtasksPanel.css';

import {Loader} from '@mantine/core';
import {useEffect, useState} from 'preact/hooks';
import {useAgents} from '../../hooks/useAgents.js';
import {joinClassNames} from '../../utils/classes.js';
import {
  getAgentAssigneeName,
  subscribeSubtasks,
  type Task,
} from '../../utils/tasks.js';
import {AgentAvatar} from '../AgentAvatar/AgentAvatar.js';

export interface SubtasksPanelProps {
  parentTaskId: string;
  className?: string;
}

/**
 * Renders the subtasks delegated under a parent task. Designed for the
 * dispatcher pattern (e.g. Blinkk) so the user can see what their primary
 * agent is coordinating without leaving the parent task page.
 */
export function SubtasksPanel(props: SubtasksPanelProps) {
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const {agents} = useAgents();

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeSubtasks(props.parentTaskId, (tasks) => {
      setSubtasks(tasks);
      setLoading(false);
    });
    return () => unsub();
  }, [props.parentTaskId]);

  if (loading) {
    return (
      <div className={joinClassNames('SubtasksPanel', props.className)}>
        <div className="SubtasksPanel__header">Subtasks</div>
        <Loader size="xs" />
      </div>
    );
  }

  if (subtasks.length === 0) {
    return null;
  }

  return (
    <div className={joinClassNames('SubtasksPanel', props.className)}>
      <div className="SubtasksPanel__header">
        Subtasks <span className="SubtasksPanel__count">{subtasks.length}</span>
      </div>
      <ul className="SubtasksPanel__list">
        {subtasks.map((task) => {
          const agentName = getAgentAssigneeName(task.assignee);
          const agent = agentName
            ? agents.find((a) => a.name === agentName)
            : null;
          const status = task.agentRun?.status || task.status || 'new';
          return (
            <li key={task.id} className="SubtasksPanel__item">
              <a className="SubtasksPanel__link" href={`/cms/tasks/${task.id}`}>
                {agentName ? (
                  <AgentAvatar
                    name={agentName}
                    iconUrl={agent?.iconUrl}
                    size={20}
                  />
                ) : (
                  <span className="SubtasksPanel__noAgent">·</span>
                )}
                <span className="SubtasksPanel__title">{task.title}</span>
                <span
                  className={joinClassNames(
                    'SubtasksPanel__status',
                    `SubtasksPanel__status--${status}`
                  )}
                >
                  {status}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
