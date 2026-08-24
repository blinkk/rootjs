import './UserTag.css';

import {Tooltip} from '@mantine/core';
import {useUserProfile} from '../../hooks/useUserProfile.js';
import {joinClassNames} from '../../utils/classes.js';
import {UserAvatar} from '../UserAvatar/UserAvatar.js';

export interface UserTagProps {
  /** Email of the user to render. */
  email: string;
  /** Optional className for the wrapping element. */
  className?: string;
}

/**
 * Renders a user's short name (the local part of their email) with a hover
 * tooltip showing their avatar, display name (if available), and full email.
 *
 * Example:
 *   <UserTag email="me@example.com" />
 */
export function UserTag(props: UserTagProps) {
  const email = props.email || '';
  const {profile} = useUserProfile(email);
  const displayName = profile?.displayName || '';
  const shortName = email.split('@')[0] || email;

  if (!email.includes('@')) {
    // Not an email (e.g. "unknown"); render as plain text without a tooltip.
    return (
      <span className={joinClassNames('UserTag', props.className)}>
        {email}
      </span>
    );
  }

  const label = (
    <div className="UserTag__tooltip">
      <UserAvatar email={email} size={20} withTooltip={false} />
      <div className="UserTag__tooltip__text">
        {displayName && (
          <span className="UserTag__tooltip__name">{displayName}</span>
        )}
        <span className="UserTag__tooltip__email">{email}</span>
      </div>
    </div>
  );
  return (
    <Tooltip label={label} position="bottom" withArrow transition="pop">
      <span className={joinClassNames('UserTag', props.className)}>
        {shortName}
      </span>
    </Tooltip>
  );
}
