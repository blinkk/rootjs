import {Tooltip} from '@mantine/core';
import {Timestamp} from 'firebase/firestore';
import {useEffect, useState} from 'preact/hooks';
import {getTimeAgo} from '../../utils/time.js';

export interface TimeSinceTooltipActionProps {
  timestamp?: number | Timestamp;
  email?: string;
}

/**
 * Displays the time since a certain action was performed.
 */
export function TimeSinceActionTooltip(props: TimeSinceTooltipActionProps) {
  const millis = toMillis(props.timestamp);
  const [label, setLabel] = useState(
    props.timestamp ? getTimeAgo(millis, {style: 'short'}) : 'never'
  );

  if (!millis) {
    return <div>{label}</div>;
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLabel(getTimeAgo(millis, {style: 'short'}));
    }, 60000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <Tooltip
      transition="pop"
      label={`${formatDateTime(millis)} by ${props.email}`}
    >
      {getTimeAgo(millis, {style: 'short'})}
    </Tooltip>
  );
}

function formatDateTime(timestamp: number) {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toMillis(timestamp?: number | Timestamp) {
  if (typeof timestamp === 'number') {
    return timestamp;
  }
  if (!timestamp) {
    return 0;
  }
  return timestamp.toMillis();
}
