import {IconAlertTriangle, IconCheck, IconX} from '@tabler/icons-preact';
import {type PublishCheckStatus} from '../../../../../shared/publish-checks.js';
import {Badge, type BadgeTone} from '../../../../primitives/Badge/Badge.js';
import {cn} from '../../../../utils/classes.js';

const STATUS_TONES: Record<PublishCheckStatus, BadgeTone> = {
  success: 'success',
  warning: 'warning',
  error: 'danger',
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
  const Icon = STATUS_ICONS[props.status];
  const label = props.status.charAt(0).toUpperCase() + props.status.slice(1);
  return (
    <Badge
      className={cn(
        'CheckStatusBadge',
        `CheckStatusBadge--status-${props.status}`,
        props.className
      )}
      tone={STATUS_TONES[props.status]}
      variant="filled"
      icon={<Icon />}
    >
      {label}
    </Badge>
  );
}
