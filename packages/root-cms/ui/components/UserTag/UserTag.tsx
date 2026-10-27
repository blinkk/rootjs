import './UserTag.css';

import {Tooltip} from '@mantine/core';
import {ComponentChildren} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {useUserProfile} from '../../hooks/useUserProfile.js';
import {joinClassNames} from '../../utils/classes.js';
import {UserAvatar} from '../UserAvatar/UserAvatar.js';

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
  // Control the tooltip so it stays open while the cursor travels to (and
  // interacts with) the popup, allowing the email to be selected/copied.
  const [opened, setOpened] = useState(false);
  const closeTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => window.clearTimeout(closeTimeoutRef.current);
  }, []);

  function open() {
    window.clearTimeout(closeTimeoutRef.current);
    setOpened(true);
  }

  function scheduleClose() {
    window.clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = window.setTimeout(() => setOpened(false), 200);
  }

  if (!email.includes('@')) {
    // Not an email (e.g. "unknown"); render as plain text without a tooltip.
    return (
      <span className={joinClassNames('UserTag', props.className)}>
        {props.children ?? email}
      </span>
    );
  }

  const label = (
    <div
      className="UserTag__tooltip"
      onPointerEnter={open}
      onPointerLeave={scheduleClose}
    >
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
    <Tooltip
      label={label}
      position="bottom"
      withArrow
      transition="pop"
      // Keep the tooltip interactive so the email can be selected/copied.
      allowPointerEvents
      opened={opened}
      onPointerEnter={open}
      onPointerLeave={scheduleClose}
    >
      <span className={joinClassNames('UserTag', props.className)}>
        {props.children ?? (displayName || shortName)}
      </span>
    </Tooltip>
  );
}
