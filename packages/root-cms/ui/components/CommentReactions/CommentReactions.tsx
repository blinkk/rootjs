import './CommentReactions.css';

import {ActionIcon, Tooltip} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {IconMoodPlus} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';
import {joinClassNames} from '../../utils/classes.js';
import {
  TASK_COMMENT_REACTIONS,
  TaskCommentReaction,
  toggleTaskCommentReaction,
} from '../../utils/tasks.js';

export interface CommentReactionsProps {
  taskId: string;
  commentId: string;
  reactions?: Record<string, string[]>;
  className?: string;
}

/**
 * Renders the row of emoji reactions on a task comment plus a "+" button to
 * add a new one. Clicking an existing reaction toggles the current user's
 * presence on it.
 */
export function CommentReactions(props: CommentReactionsProps) {
  const reactions = props.reactions || {};
  const [pickerOpen, setPickerOpen] = useState(false);
  const currentUser = (window.firebase.user.email || '').toLowerCase();
  const present = Object.entries(reactions).filter(
    ([, reactors]) => reactors.length > 0
  );

  async function toggle(emoji: TaskCommentReaction) {
    try {
      await toggleTaskCommentReaction(props.taskId, props.commentId, emoji);
      setPickerOpen(false);
    } catch (err) {
      showNotification({
        title: 'Could not toggle reaction',
        message: err instanceof Error ? err.message : String(err),
        color: 'red',
        autoClose: 3000,
      });
    }
  }

  return (
    <div className={joinClassNames('CommentReactions', props.className)}>
      {present.map(([emoji, reactors]) => {
        const isMine = reactors.includes(currentUser);
        return (
          <Tooltip
            key={emoji}
            label={reactors.join(', ')}
            withinPortal
            position="top"
          >
            <button
              type="button"
              className={joinClassNames(
                'CommentReactions__chip',
                isMine && 'CommentReactions__chip--mine'
              )}
              onClick={() => toggle(emoji as TaskCommentReaction)}
            >
              <span className="CommentReactions__emoji">{emoji}</span>
              <span className="CommentReactions__count">{reactors.length}</span>
            </button>
          </Tooltip>
        );
      })}
      <Tooltip label="Add reaction" withinPortal position="top">
        <ActionIcon
          size="sm"
          variant="subtle"
          onClick={() => setPickerOpen((p) => !p)}
          aria-label="Add reaction"
        >
          <IconMoodPlus size={16} strokeWidth="1.8" />
        </ActionIcon>
      </Tooltip>
      {pickerOpen && (
        <div
          className="CommentReactions__picker"
          role="menu"
          aria-label="Pick a reaction"
        >
          {TASK_COMMENT_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="CommentReactions__pickerItem"
              onClick={() => toggle(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
