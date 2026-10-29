import './ChecksPanel.css';

import {IconPlayerPlay} from '@tabler/icons-preact';
import {useCallback, useState} from 'preact/hooks';
import {Markdown} from '../../../../components/Markdown/Markdown.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {cn} from '../../../../utils/classes.js';
import {CheckStatusBadge} from '../CheckStatusBadge/CheckStatusBadge.js';

/** Status result from a check run. */
type CheckStatus = 'success' | 'warning' | 'error';

interface CheckResult {
  status: CheckStatus;
  message: string;
  metadata?: Record<string, any>;
}

/** Background and border for a check's result, by status. */
const RESULT_CLASSES: Record<CheckStatus, string> = {
  success: 'border-success-line bg-success-soft',
  warning: 'border-warning-line bg-warning-soft',
  error: 'border-danger-line bg-danger-soft',
};

interface CheckState {
  loading: boolean;
  result?: CheckResult;
  error?: string;
}

interface CheckMeta {
  id: string;
  label: string;
  description?: string;
  collections?: string[];
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
  const allChecks: CheckMeta[] = window.__ROOT_CTX.checks || [];
  const collectionId = props.docId.split('/')[0];
  const checks = allChecks.filter(
    (c) => !c.collections || c.collections.includes(collectionId)
  );
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
    <div className="ChecksPanel flex h-full flex-col overflow-hidden">
      <div className="ChecksPanel__header flex h-9 shrink-0 items-center justify-between gap-2 border-0 border-b border-solid border-border bg-surface px-3">
        <div className="ChecksPanel__title text-sm font-semibold text-fg">
          Checks
        </div>
        <Button size="xs" icon={<IconPlayerPlay />} onClick={onRunAll}>
          Run All
        </Button>
      </div>
      <div className="ChecksPanel__body flex-1 overflow-auto p-3">
        <div className="ChecksPanel__checks flex flex-col gap-2.5">
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
    <div className="ChecksPanel__check rounded-md border border-solid border-border p-3">
      <div className="ChecksPanel__checkHeader flex items-center justify-between gap-2">
        <div className="ChecksPanel__checkLabel flex flex-wrap items-center gap-1.5 text-sm font-medium text-fg">
          {check.label}
          {state?.result && (
            <CheckStatusBadge
              className="ChecksPanel__statusBadge"
              status={state.result.status}
            />
          )}
        </div>
        <Button
          className="ChecksPanel__runButton"
          size="xs"
          loading={state?.loading}
          onClick={onRun}
        >
          Run
        </Button>
      </div>
      {check.description && (
        <div className="ChecksPanel__checkDescription mt-1 pr-12 text-xs leading-snug text-muted">
          {check.description}
        </div>
      )}
      {state?.result && (
        <div
          className={cn(
            'ChecksPanel__result',
            `ChecksPanel__result--status-${state.result.status}`,
            'mt-2.5 rounded-sm border border-solid p-2.5 text-sm leading-normal text-fg',
            RESULT_CLASSES[state.result.status]
          )}
        >
          <Markdown code={state.result.message} />
        </div>
      )}
      {state?.error && (
        <div className="ChecksPanel__error mt-2.5 rounded-sm border border-solid border-danger-line bg-danger-soft p-2.5 text-sm text-danger">
          {state.error}
        </div>
      )}
    </div>
  );
}
