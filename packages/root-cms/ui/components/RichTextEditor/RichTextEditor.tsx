import * as schema from '../../../core/schema.js';
import {RichTextData} from '../../../shared/richtext.js';
import {useUserPreferences} from '../../hooks/useUserPreferences.js';
import {EditorJSEditor} from './editorjs/EditorJSEditor.js';
import {LexicalEditor} from './lexical/LexicalEditor.js';

export interface RichTextEditorProps {
  className?: string;
  placeholder?: string;
  value?: RichTextData | null;
  autosize?: boolean;
  onChange?: (data: RichTextData | null) => void;
  onFocus?: (e: FocusEvent) => void;
  onBlur?: (e: FocusEvent) => void;
  blockComponents?: schema.Schema[];
  inlineComponents?: schema.Schema[];
}

export function RichTextEditor(props: RichTextEditorProps) {
  const userPrefs = useUserPreferences();
  if (userPrefs.preferences.EnableLexicalEditor) {
    return <LexicalEditor {...props} />;
  }
  return <EditorJSEditor {...props} />;
}
