import './AgentAvatar.css';

import {joinClassNames} from '../../utils/classes.js';

export interface AgentAvatarProps {
  /** Agent slug. Used to derive the fallback color and the initial. */
  name: string;
  /** Optional avatar image URL. When omitted, renders a colored initial. */
  iconUrl?: string | null;
  /** Pixel size of the square avatar. Defaults to 24. */
  size?: number;
  /** Optional title attribute (defaults to the agent name). */
  title?: string;
  className?: string;
}

/**
 * Renders an agent's avatar. If `iconUrl` is provided we render an `<img>`;
 * otherwise we generate a colored circle with the agent's first letter
 * (color derived deterministically from the slug so the same agent renders
 * the same color across surfaces).
 */
export function AgentAvatar(props: AgentAvatarProps) {
  const size = props.size ?? 24;
  const style = {width: `${size}px`, height: `${size}px`} as Record<
    string,
    string | number
  >;
  const title = props.title ?? props.name;
  if (props.iconUrl) {
    return (
      <img
        className={joinClassNames(
          'AgentAvatar',
          'AgentAvatar--image',
          props.className
        )}
        src={props.iconUrl}
        alt={title}
        title={title}
        style={style}
      />
    );
  }
  const initial = (props.name?.[0] || '?').toUpperCase();
  const palette =
    AVATAR_PALETTE[hashStringToIndex(props.name, AVATAR_PALETTE.length)];
  return (
    <span
      className={joinClassNames('AgentAvatar', props.className)}
      title={title}
      aria-label={title}
      style={{
        ...style,
        background: palette.bg,
        color: palette.fg,
        fontSize: `${Math.round(size * 0.5)}px`,
      }}
    >
      {initial}
    </span>
  );
}

/**
 * Deterministic palette of background+foreground pairs. Picking an index by
 * hashing the agent name guarantees the same agent always gets the same
 * color regardless of surface or render order.
 */
const AVATAR_PALETTE: Array<{bg: string; fg: string}> = [
  {bg: '#fee2e2', fg: '#b91c1c'},
  {bg: '#ffedd5', fg: '#c2410c'},
  {bg: '#fef3c7', fg: '#a16207'},
  {bg: '#dcfce7', fg: '#15803d'},
  {bg: '#cffafe', fg: '#0e7490'},
  {bg: '#dbeafe', fg: '#1d4ed8'},
  {bg: '#e0e7ff', fg: '#4338ca'},
  {bg: '#ede9fe', fg: '#6d28d9'},
  {bg: '#fae8ff', fg: '#a21caf'},
  {bg: '#fce7f3', fg: '#be185d'},
];

function hashStringToIndex(value: string, modulo: number): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash % modulo;
}
