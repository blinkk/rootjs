import {ComponentChildren} from 'preact';
import type {Placement} from '../../../primitives/floating/useFloating.js';
import {Tooltip} from '../../../primitives/Tooltip/Tooltip.js';
import {UserAvatar} from '../UserAvatar/UserAvatar.js';

export interface UserActionTooltipProps {
  /**
   * Optional heading shown above the message, separated by a divider line
   * (e.g. "Unpublished changes").
   */
  heading?: ComponentChildren;
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
  /** Where the tooltip opens relative to the trigger. Default `top`. */
  placement?: Placement;
  /** Shows the tooltip's arrow. Default `true`. */
  withArrow?: boolean;
}

/**
 * A shared tooltip for "a user did X at some time" metadata. Renders the user's
 * avatar alongside a message and a "by <email>" line, with consistent wrapping
 * and max-width. Use anywhere a timestamp + user action needs a tooltip (e.g.
 * doc status badges, the compact collection listing's created/modified cells).
 */
export function UserActionTooltip(props: UserActionTooltipProps) {
  const {heading, message, detail, user} = props;
  const label = (
    <div className="UserActionTooltip flex max-w-60 items-center gap-2">
      {user && (
        <UserAvatar
          className="UserActionTooltip__avatar shrink-0 border border-inverse/35"
          email={user}
          size={20}
          withTooltip={false}
        />
      )}
      <div className="UserActionTooltip__text flex min-w-0 flex-col *:min-w-0 *:wrap-anywhere *:whitespace-normal">
        {heading && (
          <span className="UserActionTooltip__heading mb-1.5 border-b border-inverse/20 pb-1.5 font-semibold">
            {heading}
          </span>
        )}
        <span>{message}</span>
        {detail && (
          <span className="UserActionTooltip__detail opacity-85">{detail}</span>
        )}
        {user && <span>by {user}</span>}
      </div>
    </div>
  );
  // The trigger is wrapped so any children work, whether or not they forward
  // a ref.
  return (
    <Tooltip
      label={label}
      placement={props.placement}
      withArrow={props.withArrow}
    >
      <span className="UserActionTooltip__trigger inline-flex max-w-full">
        {props.children}
      </span>
    </Tooltip>
  );
}
