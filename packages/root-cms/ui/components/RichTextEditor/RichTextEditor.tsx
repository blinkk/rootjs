import {RichTextData} from '../../../shared/richtext.js';
import {LexicalEditor} from './LexicalEditor.js';

export interface RichTextEditorProps {
  className?: string;
  placeholder?: string;
  value?: RichTextData | null;
  onChange?: (value: RichTextData | null) => void;
}

/**
 * Rich text editor component.
 *
 * This is a wrapper around lexical's rich text editor. The previous impl of
 * this component used editorjs, and so this wrapper preserves backwards
 * compatibility by converting between lexical's data type and editorjs's.
 */
export function RichTextEditor(props: RichTextEditorProps) {
  return (
    <LexicalEditor
      className={props.className}
      placeholder={props.placeholder}
      value={props.value}
      onChange={props.onChange}
    />
  );
}
