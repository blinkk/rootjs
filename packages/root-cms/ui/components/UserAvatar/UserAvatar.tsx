import {Avatar, Tooltip} from '@mantine/core';
import {ComponentChildren} from 'preact';
import {useState} from 'preact/hooks';
import {useUserProfile, useUserProfiles} from '../../hooks/useUserProfile.js';
import {joinClassNames} from '../../utils/classes.js';
import {
  UserProfile,
  getAvatarColor,
  getUserInitials,
} from '../../utils/user-profile.js';
import './UserAvatar.css';

export interface UserAvatarProps {
  /** Email of the user to render. */
  email?: string | null;
  /**
   * Optional pre-loaded profile. When provided, no fetch is issued. Useful in
   * lists where profiles are loaded in bulk.
   */
  profile?: UserProfile | null;
  /** Avatar diameter in pixels. */
  size?: number;
  /** Whether to display the tooltip on hover. */
  withTooltip?: boolean;
  /** Optional className for the wrapping element. */
  className?: string;
  /**
   * If true, applies a slight desaturated/dim style to indicate the user is
   * inactive (e.g. disconnected from a viewing session).
   */
  inactive?: boolean;
}

/**
 * Displays a single user's avatar (profile photo or initials fallback) with a
 * hover tooltip showing the user's display name and email.
 *
 * Example:
 *   <UserAvatar email="me@example.com" size={32} />
 */
export function UserAvatar(props: UserAvatarProps) {
  const size = props.size || 30;
  const withTooltip = props.withTooltip !== false;
  const {profile: fetchedProfile} = useUserProfile(
    // Skip fetching when a profile is supplied by the caller.
    props.profile === undefined ? props.email : null
  );
  const profile = props.profile !== undefined ? props.profile : fetchedProfile;
  const email = profile?.email || props.email || '';
  const displayName = profile?.displayName || '';
  const photoURL = profile?.photoURL || '';
  const [imgError, setImgError] = useState(false);

  const avatar = (
    <Avatar
      className={joinClassNames(
        'UserAvatar',
        props.inactive && 'UserAvatar--inactive',
        props.className
      )}
      src={!imgError && photoURL ? photoURL : undefined}
      alt={displayName || email}
      size={size}
      radius="xl"
      style={
        !photoURL || imgError
          ? {
              backgroundColor: getAvatarColor(email || displayName || '?'),
              color: '#fff',
              fontWeight: 600,
              fontSize: Math.max(10, Math.round(size * 0.4)),
            }
          : undefined
      }
      imageProps={{
        onError: () => setImgError(true),
      }}
    >
      {!photoURL || imgError ? getUserInitials(email, displayName) : null}
    </Avatar>
  );

  if (!withTooltip) {
    return avatar;
  }
  return (
    <UserAvatar.Tooltip email={email} displayName={displayName}>
      {avatar}
    </UserAvatar.Tooltip>
  );
}

UserAvatar.Tooltip = function UserAvatarTooltip(props: {
  email: string;
  displayName?: string;
  children: ComponentChildren;
}) {
  if (!props.email && !props.displayName) {
    return <>{props.children}</>;
  }
  const label = (
    <div className="UserAvatar__tooltip">
      {props.displayName && (
        <div className="UserAvatar__tooltip__name">{props.displayName}</div>
      )}
      {props.email && (
        <div className="UserAvatar__tooltip__email">{props.email}</div>
      )}
    </div>
  );
  return (
    <Tooltip label={label} position="bottom" withArrow transition="pop">
      {props.children}
    </Tooltip>
  );
};

export interface UserAvatarGroupProps {
  /** Emails of the users to render. */
  emails: Array<string | null | undefined>;
  /** Maximum avatars to show before collapsing into a "+N" indicator. */
  max?: number;
  /** Avatar diameter in pixels. */
  size?: number;
  /** Optional className for the wrapping element. */
  className?: string;
  /** Optional CSS class to apply to each avatar. */
  avatarClassName?: string;
  /** Marks specific emails as inactive (renders dimmed). */
  inactiveEmails?: Set<string>;
}

/**
 * Displays a horizontally stacked group of user avatars, e.g. for showing who
 * is currently viewing a doc. Profiles are bulk-loaded via
 * `useUserProfiles()` so the underlying fetches share a cache across the page.
 */
export function UserAvatarGroup(props: UserAvatarGroupProps) {
  const size = props.size || 30;
  const max = props.max || 3;
  const emails = (props.emails || []).filter((e): e is string => Boolean(e));
  const {profiles} = useUserProfiles(emails);

  if (emails.length === 0) {
    return null;
  }

  const visible = emails.slice(0, max);
  const overflow = emails.length - visible.length;

  return (
    <div
      className={joinClassNames('UserAvatarGroup', props.className)}
      data-size={size}
    >
      {visible.map((email) => {
        const profile = profiles.get(email.toLowerCase()) || null;
        const isInactive = props.inactiveEmails?.has(email);
        return (
          <UserAvatar
            key={email}
            email={email}
            profile={profile}
            size={size}
            inactive={isInactive}
            className={joinClassNames(
              'UserAvatarGroup__avatar',
              props.avatarClassName
            )}
          />
        );
      })}
      {overflow > 0 && (
        <Avatar
          className={joinClassNames(
            'UserAvatar',
            'UserAvatarGroup__avatar',
            'UserAvatarGroup__overflow',
            props.avatarClassName
          )}
          size={size}
          radius="xl"
          style={{
            fontSize: Math.max(10, Math.round(size * 0.4)),
            fontWeight: 600,
          }}
        >
          +{overflow}
        </Avatar>
      )}
    </div>
  );
}
