import {RichTextData} from '../../../shared/richtext.js';
import {LexicalEditor} from './LexicalEditor.js';

export interface RichTextEditorProps {
  className?: string;
  placeholder?: string;
  value?: RichTextData;
  onChange?: (value: RichTextData) => void | Promise<void>;
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
    <LexicalEditor className={props.className} />
  );
}
