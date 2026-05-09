import './CommentReactions.css';

import {showNotification} from '@mantine/notifications';
import {IconMoodSmile} from '@tabler/icons-preact';
import {useEffect, useRef, useState} from 'preact/hooks';
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
 * GitHub-style reaction row. Existing reactions render as small chips with
 * a count; clicking a chip toggles the current user. The "add reaction"
 * trigger is a subtle smiley icon next to the chips that opens a horizontal
 * emoji palette.
 */
export function CommentReactions(props: CommentReactionsProps) {
  const reactions = props.reactions || {};
  const [pickerOpen, setPickerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const currentUser = (window.firebase.user.email || '').toLowerCase();
  const present = Object.entries(reactions).filter(
    ([, reactors]) => reactors.length > 0
  );

  // Close the picker on outside click / escape, the way GitHub's behaves.
  useEffect(() => {
    if (!pickerOpen) {
      return;
    }
    function onDocClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setPickerOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

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

  // Hide the row entirely when there are no reactions and we're not hovering.
  // GitHub keeps the add button hidden until hover/focus to reduce noise.
  return (
    <div
      ref={containerRef}
      className={joinClassNames(
        'CommentReactions',
        present.length === 0 && 'CommentReactions--empty',
        props.className
      )}
    >
      {present.map(([emoji, reactors]) => {
        const isMine = reactors.includes(currentUser);
        return (
          <button
            key={emoji}
            type="button"
            title={reactors.join(', ')}
            className={joinClassNames(
              'CommentReactions__chip',
              isMine && 'CommentReactions__chip--mine'
            )}
            onClick={() => toggle(emoji as TaskCommentReaction)}
          >
            <span className="CommentReactions__emoji">{emoji}</span>
            <span className="CommentReactions__count">{reactors.length}</span>
          </button>
        );
      })}
      <div className="CommentReactions__addWrap">
        <button
          type="button"
          aria-label="Add reaction"
          title="Add reaction"
          className={joinClassNames(
            'CommentReactions__add',
            pickerOpen && 'CommentReactions__add--open'
          )}
          onClick={() => setPickerOpen((p) => !p)}
        >
          <IconMoodSmile size={14} strokeWidth="1.8" />
          <span className="CommentReactions__addPlus">+</span>
        </button>
        {pickerOpen && (
          <div
            className="CommentReactions__palette"
            role="menu"
            aria-label="Pick a reaction"
          >
            {TASK_COMMENT_REACTIONS.map((emoji) => {
              const reactors = reactions[emoji] || [];
              const isMine = reactors.includes(currentUser);
              return (
                <button
                  key={emoji}
                  type="button"
                  className={joinClassNames(
                    'CommentReactions__paletteItem',
                    isMine && 'CommentReactions__paletteItem--mine'
                  )}
                  onClick={() => toggle(emoji)}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
