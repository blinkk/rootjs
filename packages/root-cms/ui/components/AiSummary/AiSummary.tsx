import './AiSummary.css';

import {Accordion, Loader} from '@mantine/core';
import {IconSparkles} from '@tabler/icons-preact';
import {useState, useRef} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';
import {cmsGetDocDiffSummary} from '../../utils/doc.js';
import {Markdown} from '../Markdown/Markdown.js';
import {Text} from '../Text/Text.js';

export interface AiSummaryProps {
  className?: string;
  docId: string;
  beforeVersion?: string;
  afterVersion?: string;
}

export function AiSummary(props: AiSummaryProps) {
  const docId = props.docId;
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const hasRequestedRef = useRef(false);

  async function loadSummary() {
    setStatus('loading');
    try {
      const res = await cmsGetDocDiffSummary(docId, {
        beforeVersion: props.beforeVersion,
        afterVersion: props.afterVersion,
      });
      setSummary(res);
      setStatus('success');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }

  function handleToggle() {
    if (!hasRequestedRef.current) {
      hasRequestedRef.current = true;
      loadSummary();
    }
  }

  let content = null;
  if (status === 'idle' || status === 'loading') {
    content = (
      <div className="AiSummary__loading">
        <Loader size="md" color="gray" />
      </div>
    );
  } else if (status === 'error') {
    content = (
      <Text className="AiSummary__content" size="body-sm" color="gray">
        Failed to load AI summary.
        {error && (
          <>
            <br />
            {error}
          </>
        )}
      </Text>
    );
  } else if (!summary) {
    content = (
      <Text className="AiSummary__content" size="body-sm" color="gray">
        No AI summary available for this draft yet.
      </Text>
    );
  } else {
    content = <Markdown className="AiSummary__content" code={summary} />;
  }

  return (
    <div className={joinClassNames(props.className, 'AiSummary')}>
      <Accordion
        iconPosition="right"
        onChange={() => handleToggle()}
        disableIconRotation={true}
      >
        <Accordion.Item
          label="Summarize changes"
          icon={<IconSparkles stroke="1.5" />}
          iconPosition="left"
        >
          {content}
        </Accordion.Item>
      </Accordion>
    </div>
  );
}
