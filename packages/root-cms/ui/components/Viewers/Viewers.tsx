import {Avatar} from '@mantine/core';
import {Fragment} from 'preact';
import {
  Viewer,
  ViewersProvider,
  getViewerFocusedField,
  isViewerDisconnected,
  useViewers,
  useViewersController,
} from '../../hooks/useViewers.js';
import {UserAvatar} from '../UserAvatar/UserAvatar.js';
import './Viewers.css';

export interface ViewersProps {
  /**
   * Unique identifier for the page being viewed. Only used when the component
   * isn't rendered within a `ViewersProvider`.
   */
  id: string;
  max?: number;
  /**
   * Called when a viewer that is focused on a field is clicked. When omitted,
   * the avatars aren't clickable.
   */
  onViewerClick?: (viewer: Viewer, focusedField: string) => void;
  /** Returns a human-readable label for a field's deep key. */
  getFieldLabel?: (deepKey: string) => string;
}

/**
 * Displays avatars viewing the current page.
 */
export function Viewers(props: ViewersProps) {
  const controller = useViewersController();
  if (!controller) {
    return (
      <ViewersProvider id={props.id}>
        <Viewers.Avatars {...props} />
      </ViewersProvider>
    );
  }
  return <Viewers.Avatars {...props} />;
}

Viewers.Avatars = (props: ViewersProps) => {
  const viewers = useViewers();

  if (viewers.length === 0) {
    return null;
  }

  // Use plain CSS instead of `AvatarsGroup` because that
  // component doesn't support using Tooltips as children.
  const limit = props.max || 3;
  const visibleViewers = viewers.slice(0, limit);
  const overflow = viewers.length - limit;

  return (
    <div className="Viewers">
      {visibleViewers.map((viewer) => {
        const focusedField = getViewerFocusedField(viewer);
        const avatar = (
          <UserAvatar
            email={viewer.email}
            size={30}
            inactive={isViewerDisconnected(viewer)}
            className="Viewers__avatar"
            tooltipNote={
              focusedField
                ? `Editing: ${props.getFieldLabel?.(focusedField) || focusedField}`
                : undefined
            }
          />
        );
        if (focusedField && props.onViewerClick) {
          return (
            <button
              key={viewer.email}
              type="button"
              className="Viewers__button"
              aria-label={`Go to the field ${viewer.email} is editing`}
              onClick={() => props.onViewerClick!(viewer, focusedField)}
            >
              {avatar}
            </button>
          );
        }
        return <Fragment key={viewer.email}>{avatar}</Fragment>;
      })}
      {overflow > 0 && (
        <Avatar className="Viewers__avatar" size={30} radius="xl">
          +{overflow}
        </Avatar>
      )}
    </div>
  );
};
