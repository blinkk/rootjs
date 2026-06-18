import './UserActionTooltip.css';

import {Tooltip} from '@mantine/core';
import {ComponentChildren} from 'preact';
import {UserAvatar} from '../UserAvatar/UserAvatar.js';

export interface UserActionTooltipProps {
  /**
   * Primary message line, typically an action and/or timestamp, e.g.
   * "Published 3d ago" or "May 1, 2026".
   */
  message: ComponentChildren;
  /**
   * Optional secondary line(s) shown between the message and the user, e.g. a
   * publishing-lock reason.
   */
  detail?: ComponentChildren;
  /**
   * Email of the user who performed the action. When set, their avatar is
   * shown and a "by <email>" line is appended.
   */
  user?: string | null;
  /** The element the tooltip is attached to. */
  children: ComponentChildren;
  /** Tooltip position. */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Mantine transition name. Defaults to "pop". */
  transition?: string;
  /** Whether to show the tooltip arrow. Defaults to true. */
  withArrow?: boolean;
}

/**
 * A shared tooltip for "a user did X at some time" metadata. Renders the user's
 * avatar alongside a message and a "by <email>" line, with consistent wrapping
 * and max-width. Use anywhere a timestamp + user action needs a tooltip (e.g.
 * doc status badges, the compact collection listing's created/modified cells).
 */
export function UserActionTooltip(props: UserActionTooltipProps) {
  const {message, detail, user} = props;
  const label = (
    <div className="UserActionTooltip">
      {user && <UserAvatar email={user} size={20} withTooltip={false} />}
      <div className="UserActionTooltip__text">
        <span>{message}</span>
        {detail && <span className="UserActionTooltip__detail">{detail}</span>}
        {user && <span>by {user}</span>}
      </div>
    </div>
  );
  return (
    <Tooltip
      label={label}
      position={props.position}
      transition={props.transition ?? 'pop'}
      withArrow={props.withArrow ?? true}
    >
      {props.children}
    </Tooltip>
  );
}
