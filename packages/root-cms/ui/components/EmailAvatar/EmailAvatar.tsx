import {useState} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';
import {
  UserProfile,
  getAvatarColor,
  getEmailAvatarInitial,
} from '../../utils/user-profile.js';
import './EmailAvatar.css';

export interface EmailAvatarProps {
  email: string;
  profile?: UserProfile | null;
  size?: number;
  className?: string;
}

/** Renders a profile photo or one-letter SVG fallback for an email entry. */
export function EmailAvatar(props: EmailAvatarProps) {
  const size = props.size || 28;
  const [imgError, setImgError] = useState(false);
  const photoURL = props.profile?.photoURL || '';
  const displayName = props.profile?.displayName || props.email;
  const className = joinClassNames('EmailAvatar', props.className);
  const style = {width: size, height: size};

  if (photoURL && !imgError) {
    return (
      <img
        className={className}
        style={style}
        src={photoURL}
        alt={displayName}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 28 28"
      role="img"
      aria-label={displayName}
    >
      <circle cx="14" cy="14" r="14" fill={getAvatarColor(props.email)} />
      <text
        x="14"
        y="14"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontSize="13"
        fontWeight="600"
      >
        {getEmailAvatarInitial(props.email)}
      </text>
    </svg>
  );
}
