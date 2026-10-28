import {IconRefresh} from '@tabler/icons-preact';
import {Button} from '../../../../primitives/Button/Button.js';
import {cn} from '../../../../utils/classes.js';

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
      className={cn(
        'ChatErrorNotice',
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-base text-danger',
        props.className
      )}
      role="alert"
    >
      <div className="ChatErrorNotice__message min-w-0 shrink grow basis-60 wrap-anywhere">
        <strong>Error:</strong> {props.error.message}
      </div>
      {(props.onRetry || props.onDismiss) && (
        <div className="ChatErrorNotice__actions ml-auto flex gap-2">
          {props.onDismiss && (
            <Button
              variant="subtle"
              size="xs"
              type="button"
              className="ChatErrorNotice__button text-danger"
              disabled={props.busy}
              onClick={props.onDismiss}
            >
              Dismiss
            </Button>
          )}
          {props.onRetry && (
            <Button
              variant="danger"
              size="xs"
              type="button"
              className="ChatErrorNotice__button"
              icon={<IconRefresh />}
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
