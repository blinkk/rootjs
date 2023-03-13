import {Badge, Tooltip} from '@mantine/core';
import {Timestamp} from 'firebase/firestore';
import {getTimeAgo} from '../../utils/time.js';

interface DocStatusBadgesProps {
  doc: {
    sys: {
      createdAt: Timestamp;
      createdBy: string;
      modifiedAt: Timestamp;
      modifiedBy: string;
      publishedAt?: Timestamp;
      publishedBy?: string;
      scheduledAt?: Timestamp;
      scheduledBy?: string;
    };
  };
  tooltipPosition?: 'bottom' | 'top';
}

export function DocStatusBadges(props: DocStatusBadgesProps) {
  const tooltipProps = {
    // position: props.tooltipPosition || 'bottom',
    transition: 'pop',
  };
  const sys = props.doc.sys;
  return (
    <div className="CollectionPage__collection__docsList__doc__content__header__badges">
      {(!sys.publishedAt ||
        !sys.modifiedAt ||
        sys.modifiedAt > sys.publishedAt) && (
        <Tooltip
          {...tooltipProps}
          label={`Modified ${timeDiff(sys.modifiedAt)} by ${sys.modifiedBy}`}
        >
          <Badge
            size="xs"
            variant="gradient"
            gradient={{from: 'indigo', to: 'cyan'}}
          >
            Draft
          </Badge>
        </Tooltip>
      )}
      {!!sys.publishedAt && (
        <Tooltip
          {...tooltipProps}
          label={`Published ${timeDiff(sys.publishedAt)} by ${sys.publishedBy}`}
        >
          <Badge
            size="xs"
            variant="gradient"
            gradient={{from: 'teal', to: 'lime', deg: 105}}
          >
            Published
          </Badge>
        </Tooltip>
      )}
      {!!sys.scheduledAt && (
        <Tooltip
          {...tooltipProps}
          label={`Scheduled ${formatDateTime(sys.scheduledAt)} by ${
            sys.scheduledBy
          }`}
        >
          <Badge
            size="xs"
            variant="gradient"
            gradient={{from: 'grape', to: 'pink', deg: 35}}
          >
            Scheduled
          </Badge>
        </Tooltip>
      )}
    </div>
  );
}

function timeDiff(ts: Timestamp | null) {
  // Since we're using server timestamps, firestore doesn't always return the
  // timestamp right away since the db save is happening asynchronously. In
  // these cases, assume that the update happened very recently.
  if (!ts) {
    return getTimeAgo(new Date().getTime());
  }
  return getTimeAgo(ts.toMillis());
}

function formatDateTime(ts: Timestamp) {
  const date = new Date(ts.toMillis());
  return date.toLocaleDateString('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
