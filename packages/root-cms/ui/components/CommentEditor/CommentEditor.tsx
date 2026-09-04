import './CommentEditor.css';

import {RichTextData} from '../../../shared/richtext.js';
import {joinClassNames} from '../../utils/classes.js';
import {LexicalEditor} from '../RichTextEditor/lexical/LexicalEditor.js';

export interface CommentEditorProps {
  className?: string;
  placeholder?: string;
  value?: RichTextData | null;
  onChange?: (value: RichTextData | null) => void;
  autoFocus?: boolean;
  /**
   * Editor chrome. `default` shows the formatting toolbar above the editor
   * (used by tasks). `minimal` hides it, leaving only the floating toolbar
   * that appears when text is selected (used by field comments).
   */
  variant?: 'default' | 'minimal';
  /** Enables `@mention` autocomplete of project users. Defaults to true. */
  mentions?: boolean;
  /** Called when the user presses Cmd+Enter (or Ctrl+Enter) in the editor. */
  onSubmitShortcut?: () => void;
  /** Called when the user pastes files (e.g. a screenshot) into the editor. */
  onPasteFiles?: (files: File[]) => void;
}

/**
 * Lightweight rich text editor for comments, shared by the task manager and
 * field comments. Supports `@mention` autocomplete of project users.
 *
 * Example:
 *   <CommentEditor
 *     variant="minimal"
 *     value={body}
 *     onChange={setBody}
 *     onSubmitShortcut={submit}
 *   />
 */
export function CommentEditor(props: CommentEditorProps) {
  const variant = props.variant || 'default';

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      props.onSubmitShortcut?.();
    }
  }

  function onPaste(e: ClipboardEvent) {
    if (!props.onPasteFiles) {
      return;
    }
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length > 0) {
      props.onPasteFiles(files);
    }
  }

  return (
    <div
      className={joinClassNames(
        'CommentEditor__wrap',
        variant === 'minimal' && 'CommentEditor__wrap--minimal'
      )}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
    >
      <LexicalEditor
        className={joinClassNames('CommentEditor', props.className)}
        placeholder={props.placeholder}
        value={props.value}
        onChange={props.onChange}
        autoFocus={props.autoFocus}
        autosize
        variant="comment"
        hideToolbar={variant === 'minimal'}
        mentions={props.mentions !== false}
      />
    </div>
  );
}
