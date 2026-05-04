import * as schema from '../../../core/schema.js';
import {RichTextData} from '../../../shared/richtext.js';
import {useUserPreferences} from '../../hooks/useUserPreferences.js';
import {EditorJSEditor} from './editorjs/EditorJSEditor.js';
import {LexicalEditor} from './lexical/LexicalEditor.js';

export interface RichTextEditorProps {
  className?: string;
  /**
   * The deep key of the rich text field within the document. Optional, but
   * required for features that need to target a specific rich text instance
   * from outside the editor (e.g. opening a block component modal from the
   * document search panel).
   */
  deepKey?: string;
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
  if (userPrefs.preferences.EnableEditorJSEditor) {
    // EditorJSEditor doesn't use `deepKey`; strip it before forwarding.
    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      deepKey,
      ...rest
    } = props;
    return <EditorJSEditor {...rest} />;
  }
  return <LexicalEditor {...props} />;
}
