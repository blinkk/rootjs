import './AgentRunPanel.css';

import {Button, Loader, Tooltip} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconCheck,
  IconClockHour4,
  IconCircleCheck,
  IconRefresh,
  IconRobot,
  IconX,
} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';
import {useAgents} from '../../hooks/useAgents.js';
import {joinClassNames} from '../../utils/classes.js';
import {errorMessage} from '../../utils/notifications.js';
import {
  cancelTaskAgentRun,
  getAgentAssigneeName,
  retryTaskAgentRun,
  type Task,
} from '../../utils/tasks.js';
import {Surface} from '../Surface/Surface.js';

export interface AgentRunPanelProps {
  task: Task;
}

type RunStatus = 'idle' | 'running' | 'completed' | 'errored' | 'cancelled';

/**
 * Sidebar panel that surfaces the agent run state and lets the human cancel
 * an in-flight run or retry a terminal one. Renders only when the task's
 * assignee is `agent:*`.
 */
export function AgentRunPanel(props: AgentRunPanelProps) {
  const {task} = props;
  const agentName = getAgentAssigneeName(task.assignee) || 'agent';
  const {agents} = useAgents();
  const agent = agents.find((a) => a.name === agentName);
  const run = task.agentRun;
  const status = (run?.status as RunStatus | undefined) || 'idle';
  const [busy, setBusy] = useState(false);

  async function onCancel() {
    setBusy(true);
    try {
      await cancelTaskAgentRun(task.id);
    } catch (err) {
      showNotification({
        title: 'Could not cancel run',
        message: errorMessage(err),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setBusy(false);
    }
  }

  async function onRetry() {
    setBusy(true);
    try {
      await retryTaskAgentRun(task.id);
    } catch (err) {
      showNotification({
        title: 'Could not retry run',
        message: errorMessage(err),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setBusy(false);
    }
  }

  const statusMeta = STATUS_META[status];
  const tokensUsed = run?.tokensUsed ?? 0;
  const tokensCap = run?.tokensCap;
  const tokensPct =
    tokensCap && tokensCap > 0
      ? Math.min(100, Math.round((tokensUsed / tokensCap) * 100))
      : null;
  const showRetry =
    status === 'errored' || status === 'cancelled' || status === 'completed';

  return (
    <Surface className="AgentRunPanel">
      <div className="AgentRunPanel__header">
        <div className="AgentRunPanel__avatar" aria-hidden="true">
          {agent?.icon || <IconRobot size={18} strokeWidth="1.8" />}
        </div>
        <div className="AgentRunPanel__heading">
          <div className="AgentRunPanel__name">{agentName}</div>
          {agent?.description && (
            <div className="AgentRunPanel__desc">{agent.description}</div>
          )}
        </div>
      </div>

      <div
        className={joinClassNames(
          'AgentRunPanel__status',
          `AgentRunPanel__status--${status}`
        )}
      >
        <span className="AgentRunPanel__statusIcon">
          {status === 'running' ? (
            <Loader size={12} color="currentColor" />
          ) : (
            statusMeta.icon
          )}
        </span>
        <span className="AgentRunPanel__statusLabel">{statusMeta.label}</span>
      </div>

      {tokensCap !== undefined && (
        <div className="AgentRunPanel__tokens">
          <div className="AgentRunPanel__tokensRow">
            <span className="AgentRunPanel__tokensLabel">Tokens</span>
            <span className="AgentRunPanel__tokensValue">
              {tokensUsed.toLocaleString()}
              {tokensCap > 0 && <> / {tokensCap.toLocaleString()}</>}
            </span>
          </div>
          {tokensPct !== null && (
            <div className="AgentRunPanel__progress">
              <div
                className="AgentRunPanel__progressFill"
                style={{width: `${tokensPct}%`}}
              />
            </div>
          )}
        </div>
      )}

      {run?.lastError && (
        <div className="AgentRunPanel__error">
          <IconAlertTriangle size={14} strokeWidth="2" />
          <span>{run.lastError}</span>
        </div>
      )}

      <div className="AgentRunPanel__actions">
        {status === 'running' && (
          <Tooltip
            label="Halt the run between tool steps"
            withinPortal
            position="top"
          >
            <Button
              size="xs"
              variant="default"
              loading={busy}
              leftIcon={<IconX size={14} strokeWidth="1.8" />}
              onClick={onCancel}
            >
              Cancel run
            </Button>
          </Tooltip>
        )}
        {showRetry && (
          <Tooltip
            label="Reset the run and let the agent start fresh"
            withinPortal
            position="top"
          >
            <Button
              size="xs"
              color="dark"
              loading={busy}
              leftIcon={<IconRefresh size={14} strokeWidth="1.8" />}
              onClick={onRetry}
            >
              Run again
            </Button>
          </Tooltip>
        )}
      </div>
    </Surface>
  );
}

const STATUS_META: Record<
  RunStatus,
  {label: string; icon: preact.ComponentChildren}
> = {
  idle: {
    label: 'Queued',
    icon: <IconClockHour4 size={13} strokeWidth="2" />,
  },
  running: {
    label: 'Running',
    icon: null, // Spinner rendered separately.
  },
  completed: {
    label: 'Completed',
    icon: <IconCircleCheck size={13} strokeWidth="2" />,
  },
  errored: {
    label: 'Errored',
    icon: <IconAlertTriangle size={13} strokeWidth="2" />,
  },
  cancelled: {
    label: 'Cancelled',
    icon: <IconCheck size={13} strokeWidth="2" />,
  },
};
