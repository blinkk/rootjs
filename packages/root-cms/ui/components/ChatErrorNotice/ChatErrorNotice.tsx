import './ChatErrorNotice.css';

import {Button} from '@mantine/core';
import {IconRefresh} from '@tabler/icons-preact';
import {joinClassNames} from '../../utils/classes.js';

/** Props for {@link ChatErrorNotice}. */
export interface ChatErrorNoticeProps {
  className?: string;
  /** The error raised by the chat (`useChat().error`). */
  error: Error;
  /** Re-sends the failed turn. Omit to hide the retry button. */
  onRetry?: () => void;
  /** Clears the error without retrying. Omit to hide the dismiss button. */
  onDismiss?: () => void;
  /** Disables the actions while a retry is in flight. */
  busy?: boolean;
}

/**
 * Error banner shown below a chat transcript when a turn fails, e.g. when the
 * model provider is overloaded. Offers a "Retry" button so the user can re-send
 * the last message without retyping it.
 */
export function ChatErrorNotice(props: ChatErrorNoticeProps) {
  return (
    <div
      className={joinClassNames('ChatErrorNotice', props.className)}
      role="alert"
    >
      <div className="ChatErrorNotice__message">
        <strong>Error:</strong> {props.error.message}
      </div>
      {(props.onRetry || props.onDismiss) && (
        <div className="ChatErrorNotice__actions">
          {props.onDismiss && (
            <Button
              variant="subtle"
              color="red"
              size="xs"
              type="button"
              className="ChatErrorNotice__button"
              disabled={props.busy}
              onClick={props.onDismiss}
            >
              Dismiss
            </Button>
          )}
          {props.onRetry && (
            <Button
              variant="filled"
              color="red"
              size="xs"
              type="button"
              className="ChatErrorNotice__button"
              leftIcon={<IconRefresh size={14} />}
              disabled={props.busy}
              onClick={props.onRetry}
            >
              Retry
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
