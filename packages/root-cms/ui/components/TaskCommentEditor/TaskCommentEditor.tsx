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
}

/** Lightweight Lexical editor for task comments and replies. */
export function TaskCommentEditor(props: TaskCommentEditorProps) {
  return (
    <LexicalEditor
      className={joinClassNames('TaskCommentEditor', props.className)}
      placeholder={props.placeholder}
      value={props.value}
      onChange={props.onChange}
      autoFocus={props.autoFocus}
      autosize
      variant="comment"
    />
  );
}
