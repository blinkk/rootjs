import * as schema from '../../../core/schema.js';
import {
  RichTextData,
  RichTextParagraphSizeOption,
} from '../../../shared/richtext.js';
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
  /** Paragraph size variants offered in the block type dropdown. */
  paragraphSizes?: Array<RichTextParagraphSizeOption | string>;
}

export function RichTextEditor(props: RichTextEditorProps) {
  return <LexicalEditor {...props} />;
}
