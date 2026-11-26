import * as schema from '../../../../../core/schema.js';
import {
  RichTextData,
  RichTextParagraphSizeOption,
} from '../../../../../shared/richtext.js';
import {lazyComponent} from '../../../../app/lazy-component.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';

const LazyLexicalEditor = lazyComponent<RichTextEditorProps>(
  () => import('./lexical/LexicalEditor.js').then((m) => m.LexicalEditor),
  {
    // Match the toolbar + editor minimum height (~176px) to avoid layout shift
    // while the Lexical chunk loads.
    fallback: (
      <div className="RichTextEditor__loading flex min-h-44 items-center justify-center rounded-sm border border-solid border-input-border bg-surface">
        <Spinner size="md" />
      </div>
    ),
  }
);

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
  return <LazyLexicalEditor {...props} />;
}
