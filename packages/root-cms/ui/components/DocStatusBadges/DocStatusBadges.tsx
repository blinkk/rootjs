import './DocStatusBadges.css';

import {Badge, Tooltip} from '@mantine/core';
import {Timestamp} from 'firebase/firestore';
import {CMSDoc, testPublishingLocked} from '../../utils/doc.js';
import {safeTimestamp} from '../../utils/time.js';
import {formatDateTime, getTimeAgo} from '../../utils/time.js';

interface DocStatusBadgesProps {
  doc: CMSDoc;
  tooltipPosition?: 'bottom' | 'top';
}

export function DocStatusBadges(props: DocStatusBadgesProps) {
  const tooltipProps = {
    // position: props.tooltipPosition || 'bottom',
    transition: 'pop',
  };
  const doc = props.doc;
  const sys = doc.sys;
  return (
    <div className="DocStatusBadges">
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
      {testPublishingLocked(doc) && (
        <Tooltip
          {...tooltipProps}
          label={`Locked by ${doc.sys.publishingLocked.lockedBy}: "${doc.sys.publishingLocked.reason}"`}
        >
          <Badge
            size="xs"
            variant="gradient"
            gradient={{from: 'orange', to: 'red'}}
          >
            Locked
          </Badge>
        </Tooltip>
      )}
    </div>
  );
}

function timeDiff(ts: Timestamp | null) {
  const validTs = safeTimestamp(ts);
  if (!validTs) {
    return getTimeAgo(new Date().getTime());
  }
  return getTimeAgo(validTs.toMillis());
}
