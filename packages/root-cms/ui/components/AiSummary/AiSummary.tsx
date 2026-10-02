import './AiSummary.css';

import {Button, Loader} from '@mantine/core';
import {IconRobot} from '@tabler/icons-preact';
import {useRef, useState} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';
import {cmsGetDocDiffSummary} from '../../utils/doc.js';
import {Markdown} from '../Markdown/Markdown.js';
import {Text} from '../Text/Text.js';

export type AiSummaryStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UseAiSummaryOptions {
  docId: string;
  beforeVersion?: string;
  afterVersion?: string;
}

/**
 * Summarizes the changes between two versions of a doc with Root AI.
 *
 * The summary is never generated automatically. Call `generate()` in response
 * to a user action, e.g. a button click.
 */
export function useAiSummary(options: UseAiSummaryOptions) {
  const [status, setStatus] = useState<AiSummaryStatus>('idle');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  // Ignores responses from requests superseded by a newer `generate()` call.
  const requestIdRef = useRef(0);

  async function generate() {
    const requestId = ++requestIdRef.current;
    setStatus('loading');
    setError('');
    try {
      const res = await cmsGetDocDiffSummary(options.docId, {
        beforeVersion: options.beforeVersion,
        afterVersion: options.afterVersion,
      });
      if (requestId !== requestIdRef.current) {
        return;
      }
      setSummary(res);
      setStatus('success');
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      console.error(err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }

  return {status, summary, error, generate};
}

export interface AiSummaryResultProps {
  className?: string;
  status: AiSummaryStatus;
  summary: string;
  error?: string;
}

/** Renders the output of `useAiSummary()`. Renders nothing while idle. */
export function AiSummaryResult(props: AiSummaryResultProps) {
  const className = joinClassNames(props.className, 'AiSummaryResult');
  if (props.status === 'idle') {
    return null;
  }
  if (props.status === 'loading') {
    return (
      <div className={joinClassNames(className, 'AiSummaryResult--loading')}>
        <Loader size="sm" color="gray" />
        <Text size="body-sm" color="gray">
          Summarizing changes...
        </Text>
      </div>
    );
  }
  if (props.status === 'error') {
    return (
      <Text className={className} size="body-sm" color="gray">
        Failed to load AI summary.
        {props.error && (
          <>
            <br />
            {props.error}
          </>
        )}
      </Text>
    );
  }
  if (!props.summary) {
    return (
      <Text className={className} size="body-sm" color="gray">
        No changes to summarize.
      </Text>
    );
  }
  return <Markdown className={className} code={props.summary} />;
}

export interface AiSummaryProps {
  className?: string;
  docId: string;
  beforeVersion?: string;
  afterVersion?: string;
}

/**
 * A panel that summarizes the changes between two versions of a doc with
 * Root AI when the user clicks "Summarize".
 */
export function AiSummary(props: AiSummaryProps) {
  const aiSummary = useAiSummary({
    docId: props.docId,
    beforeVersion: props.beforeVersion,
    afterVersion: props.afterVersion,
  });
  const generated = aiSummary.status === 'success';

  return (
    <div className={joinClassNames(props.className, 'AiSummary')}>
      <div className="AiSummary__header">
        <IconRobot className="AiSummary__header__icon" size={18} />
        <div className="AiSummary__header__label">AI summary</div>
        <div className="AiSummary__header__help">
          Summarize the changes with Root AI.
        </div>
        <Button
          className="AiSummary__header__button"
          variant="default"
          size="xs"
          compact
          loading={aiSummary.status === 'loading'}
          onClick={() => aiSummary.generate()}
        >
          {generated ? 'Regenerate' : 'Summarize'}
        </Button>
      </div>
      {aiSummary.status !== 'idle' && (
        <div className="AiSummary__body">
          <AiSummaryResult
            status={aiSummary.status}
            summary={aiSummary.summary}
            error={aiSummary.error}
          />
        </div>
      )}
    </div>
  );
}
