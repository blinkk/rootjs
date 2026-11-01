import {RelativeTime} from '../../../components/RelativeTime/RelativeTime.js';
import {Text} from '../../../components/Text/Text.js';
import {Badge} from '../../../primitives/Badge/Badge.js';
import {type ClassNames, cn} from '../../../utils/classes.js';
import {timestampToMillis} from '../../../utils/time.js';
import {EmailAvatar} from '../EmailAvatar/EmailAvatar.js';
import {UserProfile} from '../user-profile.js';

export interface UserInfoProps {
  email: string;
  profile?: UserProfile | null;
  className?: string;
  /** Classes for inner elements: `avatar` and `email`. */
  classNames?: ClassNames<'avatar' | 'email'>;
}

/**
 * Identifies a user in a list: their avatar, display name (or email when
 * they don't have one), email and last login, with a badge on the current
 * user. Grows to fill its row.
 */
export function UserInfo(props: UserInfoProps) {
  const {email, profile, classNames} = props;
  const displayName = profile?.displayName?.trim();
  const lastLogin = timestampToMillis(profile?.lastSignedInAt);
  const isCurrentUser = email === window.firebase?.user?.email;
  return (
    <div
      className={cn(
        'UserInfo flex min-w-0 flex-1 items-center gap-2',
        props.className
      )}
    >
      <EmailAvatar
        className={cn('UserInfo__avatar size-6 shrink-0', classNames?.avatar)}
        email={email}
        profile={profile}
        size={24}
      />
      <div className="UserInfo__text min-w-0 flex-1">
        <div className="UserInfo__title flex min-w-0 items-center gap-1.5">
          <Text
            className={cn(
              'min-w-0 truncate',
              displayName ? 'UserInfo__name' : 'UserInfo__email',
              !displayName && classNames?.email
            )}
            size="body-sm"
            weight="semi-bold"
            color="gray"
          >
            {displayName || email}
          </Text>
          {isCurrentUser && (
            <Badge className="UserInfo__youBadge" size="xs">
              You
            </Badge>
          )}
        </div>
        {(displayName || lastLogin > 0) && (
          <Text
            className="UserInfo__details flex min-w-0 gap-1"
            size="body-sm"
            color="gray"
          >
            {displayName && (
              <span
                className={cn(
                  'UserInfo__email min-w-0 truncate',
                  classNames?.email
                )}
              >
                {email}
              </span>
            )}
            {lastLogin > 0 && (
              <span className="UserInfo__lastLogin shrink-0 whitespace-nowrap">
                {displayName && '· '}Last login{' '}
                <RelativeTime ts={lastLogin} underline={false} />
              </span>
            )}
          </Text>
        )}
      </div>
    </div>
  );
}
