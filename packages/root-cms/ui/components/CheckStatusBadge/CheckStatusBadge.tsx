import './CheckStatusBadge.css';

import {Badge} from '@mantine/core';
import {IconAlertTriangle, IconCheck, IconX} from '@tabler/icons-preact';
import {type PublishCheckStatus} from '../../../shared/publish-checks.js';
import {joinClassNames} from '../../utils/classes.js';

const STATUS_COLORS: Record<PublishCheckStatus, string> = {
  success: 'green',
  warning: 'yellow',
  error: 'red',
};

const STATUS_ICONS: Record<PublishCheckStatus, any> = {
  success: IconCheck,
  warning: IconAlertTriangle,
  error: IconX,
};

export interface CheckStatusBadgeProps {
  /** The outcome of the check run. */
  status: PublishCheckStatus;
  className?: string;
}

/** Badge that displays the outcome of a CMS check run. */
export function CheckStatusBadge(props: CheckStatusBadgeProps) {
  const color = STATUS_COLORS[props.status];
  const Icon = STATUS_ICONS[props.status];
  const label = props.status.charAt(0).toUpperCase() + props.status.slice(1);
  return (
    <Badge
      className={joinClassNames('CheckStatusBadge', props.className)}
      color={color}
      size="sm"
      variant="filled"
      leftSection={<Icon size={10} />}
    >
      {label}
    </Badge>
  );
}
