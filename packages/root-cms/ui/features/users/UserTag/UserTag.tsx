import './UserTag.css';

import {ComponentChildren} from 'preact';
import {Tooltip} from '../../../primitives/Tooltip/Tooltip.js';
import {cn} from '../../../utils/classes.js';
import {UserAvatar} from '../UserAvatar/UserAvatar.js';
import {useUserProfile} from '../useUserProfile.js';

export interface UserTagProps {
  /** Email of the user to render. */
  email: string;
  /** Optional className for the wrapping element. */
  className?: string;
  /**
   * Custom label to render instead of the user's name (e.g. `@Name` for a
   * mention).
   */
  children?: ComponentChildren;
}

/**
 * Renders a user's display name (falling back to the local part of their email
 * until a profile is saved) with a hover tooltip showing their avatar, display
 * name, and full email.
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
      <span className={cn('UserTag', props.className)}>
        {props.children ?? email}
      </span>
    );
  }

  // The tooltip is interactive, so the email can be selected and copied.
  const label = (
    <div className="UserTag__tooltip flex max-w-60 items-center gap-2">
      <UserAvatar email={email} size={20} withTooltip={false} />
      <div className="UserTag__tooltip__text flex min-w-0 flex-col">
        {displayName && (
          <span className="UserTag__tooltip__name font-semibold">
            {displayName}
          </span>
        )}
        <span className="UserTag__tooltip__email">{email}</span>
      </div>
    </div>
  );
  return (
    <Tooltip label={label} placement="bottom" interactive>
      <span className={cn('UserTag', props.className)}>
        {props.children ?? (displayName || shortName)}
      </span>
    </Tooltip>
  );
}
