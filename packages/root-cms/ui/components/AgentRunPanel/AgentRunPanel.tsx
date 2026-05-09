import './AgentRunPanel.css';

import {Button, Loader, RingProgress, Tooltip} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconCheck,
  IconClockHour4,
  IconCircleCheck,
  IconRefresh,
  IconX,
} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {useAgents} from '../../hooks/useAgents.js';
import {joinClassNames} from '../../utils/classes.js';
import {errorMessage} from '../../utils/notifications.js';
import {
  cancelTaskAgentRun,
  getAgentAssigneeName,
  retryTaskAgentRun,
  subscribeAgentSteps,
  type AgentRunStep,
  type Task,
} from '../../utils/tasks.js';
import {AgentAvatar} from '../AgentAvatar/AgentAvatar.js';
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
  const [steps, setSteps] = useState<AgentRunStep[]>([]);

  useEffect(() => {
    if (!task.id) {
      return;
    }
    const unsub = subscribeAgentSteps(task.id, setSteps);
    return () => unsub();
  }, [task.id]);

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
        <AgentAvatar
          name={agentName}
          iconUrl={agent?.iconUrl}
          size={36}
          className="AgentRunPanel__avatar"
        />
        <div className="AgentRunPanel__heading">
          <div className="AgentRunPanel__name">{agentName}</div>
          {agent?.description && (
            <div className="AgentRunPanel__desc">{agent.description}</div>
          )}
        </div>
        {tokensCap !== undefined && tokensPct !== null && (
          <Tooltip
            label={
              <span>
                {tokensUsed.toLocaleString()} / {tokensCap.toLocaleString()}{' '}
                tokens used
              </span>
            }
            withinPortal
            position="top"
          >
            <div className="AgentRunPanel__tokenRing">
              <RingProgress
                size={36}
                thickness={4}
                sections={[
                  {value: tokensPct, color: tokensRingColor(tokensPct)},
                ]}
                label={
                  <div className="AgentRunPanel__tokenRingLabel">
                    {tokensPct}%
                  </div>
                }
              />
            </div>
          </Tooltip>
        )}
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

      {run?.lastError && (
        <div className="AgentRunPanel__error">
          <IconAlertTriangle size={14} strokeWidth="2" />
          <span>{run.lastError}</span>
        </div>
      )}

      {steps.length > 0 && (
        <div className="AgentRunPanel__activity">
          <div className="AgentRunPanel__activityHeader">Activity</div>
          <ol className="AgentRunPanel__activityList">
            {steps.map((step) => (
              <li key={step.id} className="AgentRunPanel__activityItem">
                <span className="AgentRunPanel__activityIndex">
                  {step.index}
                </span>
                <div className="AgentRunPanel__activityBody">
                  {(step.toolCalls || []).map((tc, i) => (
                    <div key={i} className="AgentRunPanel__activityTool">
                      <span className="AgentRunPanel__activityToolName">
                        {tc.toolName}
                      </span>
                      <span className="AgentRunPanel__activityToolInput">
                        {summarizeToolInput(tc.input)}
                      </span>
                    </div>
                  ))}
                  {(step.toolCalls || []).length === 0 && step.text && (
                    <div className="AgentRunPanel__activityText">
                      {step.text}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
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

/**
 * Picks a ring color that escalates as the run approaches its token cap so
 * the user gets a visual cue that the agent might be running long.
 */
function tokensRingColor(pct: number): string {
  if (pct >= 90) return 'red';
  if (pct >= 70) return 'orange';
  return 'indigo';
}

function summarizeToolInput(
  input: Record<string, string> | null | undefined
): string {
  if (!input) {
    return '';
  }
  // Prefer the most identifying fields when present.
  if (input.docId) return input.docId;
  if (input.checkId && input.docId) return `${input.checkId} → ${input.docId}`;
  if (input.checkId) return input.checkId;
  if (input.collectionId) return input.collectionId;
  if (input.tool) return input.tool;
  if (input.title) return input.title;
  if (input.query) return input.query;
  // Fallback: first key=value pair.
  const entries = Object.entries(input);
  if (entries.length === 0) return '';
  const [k, v] = entries[0];
  return `${k}=${v}`;
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
