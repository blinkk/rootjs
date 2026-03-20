import './ChecksPanel.css';

import {Badge, Button} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconPlayerPlay,
  IconX,
} from '@tabler/icons-preact';
import {useCallback, useState} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';
import {Markdown} from '../Markdown/Markdown.js';

/** Status result from a check run. */
type CheckStatus = 'success' | 'warning' | 'error';

interface CheckResult {
  status: CheckStatus;
  message: string;
  metadata?: Record<string, any>;
}

interface CheckState {
  loading: boolean;
  result?: CheckResult;
  error?: string;
}

interface CheckMeta {
  id: string;
  label: string;
  description?: string;
}

export interface ChecksPanelProps {
  /** The document ID to run checks against. */
  docId: string;
}

/** Runs a single check via the server-side API. */
async function runCheck(checkId: string, docId: string): Promise<CheckResult> {
  const res = await fetch('/cms/api/check.test', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({check: checkId, docId}),
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Check failed.');
  }
  return data.data as CheckResult;
}

/**
 * Inline panel component that displays registered CMS checks and allows
 * running them on demand against a document.
 */
export function ChecksPanel(props: ChecksPanelProps) {
  const checks: CheckMeta[] = window.__ROOT_CTX.checks || [];
  const [states, setStates] = useState<Record<string, CheckState>>({});

  const onRunCheck = useCallback(
    async (checkId: string) => {
      setStates((prev) => ({
        ...prev,
        [checkId]: {loading: true},
      }));
      try {
        const result = await runCheck(checkId, props.docId);
        setStates((prev) => ({
          ...prev,
          [checkId]: {loading: false, result},
        }));
      } catch (err: any) {
        setStates((prev) => ({
          ...prev,
          [checkId]: {loading: false, error: err.message || 'Unknown error.'},
        }));
      }
    },
    [props.docId]
  );

  const onRunAll = useCallback(async () => {
    const loadingStates: Record<string, CheckState> = {};
    for (const check of checks) {
      loadingStates[check.id] = {loading: true};
    }
    setStates(loadingStates);

    for (const check of checks) {
      try {
        const result = await runCheck(check.id, props.docId);
        setStates((prev) => ({
          ...prev,
          [check.id]: {loading: false, result},
        }));
      } catch (err: any) {
        setStates((prev) => ({
          ...prev,
          [check.id]: {
            loading: false,
            error: err.message || 'Unknown error.',
          },
        }));
      }
    }
  }, [props.docId, checks]);

  return (
    <div className="ChecksPanel">
      <div className="ChecksPanel__header">
        <div className="ChecksPanel__header__title">Checks</div>
        <Button
          variant="default"
          size="xs"
          compact
          leftIcon={<IconPlayerPlay size={12} />}
          onClick={onRunAll}
        >
          Run All
        </Button>
      </div>
      <div className="ChecksPanel__body">
        <div className="ChecksPanel__checks">
          {checks.map((check) => {
            const state = states[check.id];
            return (
              <CheckItem
                key={check.id}
                check={check}
                state={state}
                onRun={() => onRunCheck(check.id)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface CheckItemProps {
  check: CheckMeta;
  state?: CheckState;
  onRun: () => void;
}

function CheckItem(props: CheckItemProps) {
  const {check, state, onRun} = props;

  return (
    <div className="ChecksPanel__check">
      <div className="ChecksPanel__check__header">
        <div className="ChecksPanel__check__label">
          {check.label}
          {state?.result && <StatusBadge status={state.result.status} />}
        </div>
        <Button
          className="ChecksPanel__check__runButton"
          variant="default"
          size="xs"
          compact
          loading={state?.loading}
          onClick={onRun}
        >
          Run
        </Button>
      </div>
      {check.description && (
        <div className="ChecksPanel__check__description">
          {check.description}
        </div>
      )}
      {state?.result && (
        <div
          className={joinClassNames(
            'ChecksPanel__check__result',
            `ChecksPanel__check__result--${state.result.status}`
          )}
        >
          <Markdown code={state.result.message} />
        </div>
      )}
      {state?.error && (
        <div className="ChecksPanel__check__error">{state.error}</div>
      )}
    </div>
  );
}

const STATUS_COLORS: Record<CheckStatus, string> = {
  success: 'green',
  warning: 'yellow',
  error: 'red',
};

const STATUS_ICONS: Record<CheckStatus, any> = {
  success: IconCheck,
  warning: IconAlertTriangle,
  error: IconX,
};

function StatusBadge(props: {status: CheckStatus}) {
  const color = STATUS_COLORS[props.status];
  const Icon = STATUS_ICONS[props.status];
  const label = props.status.charAt(0).toUpperCase() + props.status.slice(1);
  return (
    <Badge
      className="ChecksPanel__statusBadge"
      color={color}
      size="sm"
      variant="filled"
      leftSection={<Icon size={10} />}
    >
      {label}
    </Badge>
  );
}
