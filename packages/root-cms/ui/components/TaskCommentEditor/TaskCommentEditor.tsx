import './TaskCommentEditor.css';

import {RichTextData} from '../../../shared/richtext.js';
import {joinClassNames} from '../../utils/classes.js';
import {LexicalEditor} from '../RichTextEditor/lexical/LexicalEditor.js';

export interface TaskCommentEditorProps {
  className?: string;
  placeholder?: string;
  value?: RichTextData | null;
  onChange?: (value: RichTextData | null) => void;
  autoFocus?: boolean;
  /** Called when the user presses Cmd+Enter (or Ctrl+Enter) in the editor. */
  onSubmitShortcut?: () => void;
  /** Called when the user pastes files (e.g. a screenshot) into the editor. */
  onPasteFiles?: (files: File[]) => void;
}

/** Lightweight Lexical editor for task comments and replies. */
export function TaskCommentEditor(props: TaskCommentEditorProps) {
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
      className="TaskCommentEditor__wrap"
      onKeyDown={onKeyDown}
      onPaste={onPaste}
    >
      <LexicalEditor
        className={joinClassNames('TaskCommentEditor', props.className)}
        placeholder={props.placeholder}
        value={props.value}
        onChange={props.onChange}
        autoFocus={props.autoFocus}
        autosize
        variant="comment"
      />
    </div>
  );
}
