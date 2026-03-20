import './ChecksDrawer.css';

import {Badge, Button, Drawer} from '@mantine/core';
import {
  IconCheck,
  IconAlertTriangle,
  IconX,
  IconPlayerPlay,
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
}

export interface ChecksDrawerProps {
  /** Whether the drawer is open. */
  opened: boolean;
  /** Called when the drawer is closed. */
  onClose: () => void;
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
 * A drawer component that displays registered CMS checks and allows users
 * to run them on demand against a document.
 */
export function ChecksDrawer(props: ChecksDrawerProps) {
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
    <Drawer
      opened={props.opened}
      onClose={props.onClose}
      position="right"
      size="md"
      padding="lg"
      title=""
      withCloseButton
    >
      <div className="ChecksDrawer__header">
        <div className="ChecksDrawer__header__title">Checks</div>
        <Button
          variant="light"
          color="dark"
          size="xs"
          compact
          leftIcon={<IconPlayerPlay size={14} />}
          onClick={onRunAll}
        >
          Run All
        </Button>
      </div>
      <div className="ChecksDrawer__checks">
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
    </Drawer>
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
    <div className="ChecksDrawer__check">
      <div className="ChecksDrawer__check__header">
        <div className="ChecksDrawer__check__label">
          {check.label}
          {state?.result && <StatusBadge status={state.result.status} />}
        </div>
        <Button
          className="ChecksDrawer__check__runButton"
          variant="default"
          size="xs"
          compact
          loading={state?.loading}
          onClick={onRun}
        >
          Run
        </Button>
      </div>
      {state?.result && (
        <div
          className={joinClassNames(
            'ChecksDrawer__check__result',
            `ChecksDrawer__check__result--${state.result.status}`
          )}
        >
          <Markdown code={state.result.message} />
        </div>
      )}
      {state?.error && (
        <div className="ChecksDrawer__check__error">{state.error}</div>
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
      color={color}
      size="sm"
      variant="filled"
      leftSection={<Icon size={10} />}
      style={{marginLeft: 8, verticalAlign: 'middle'}}
    >
      {label}
    </Badge>
  );
}
