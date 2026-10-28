import {Timestamp} from 'firebase/firestore';
import {useEffect, useState} from 'preact/hooks';
import {Tooltip} from '../../primitives/Tooltip/Tooltip.js';
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
    millis > 0 ? getTimeAgo(millis, {style: 'short'}) : 'never'
  );

  useEffect(() => {
    if (!millis) {
      return undefined;
    }
    const interval = window.setInterval(() => {
      setLabel(getTimeAgo(millis, {style: 'short'}));
    }, 60000);
    return () => window.clearInterval(interval);
  }, [millis]);

  if (!millis) {
    return <div className="TimeSinceActionTooltip">{label}</div>;
  }

  return (
    <Tooltip label={`${formatDateTime(millis)} by ${props.email}`}>
      <span className="TimeSinceActionTooltip">
        {getTimeAgo(millis, {style: 'short'})}
      </span>
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
  if (!timestamp?.toMillis) {
    return 0;
  }
  return timestamp.toMillis();
}
