import {
  EditorConfig,
  LexicalNode,
  NodeKey,
  ParagraphNode,
  RangeSelection,
  SerializedParagraphNode,
  Spread,
} from 'lexical';
import {
  parseRichTextParagraphSize,
  RichTextParagraphSize,
} from '../../../../../shared/richtext.js';

export type SerializedSizedParagraphNode = Spread<
  {
    type: 'sized-paragraph';
    size: RichTextParagraphSize;
  },
  SerializedParagraphNode
>;

/**
 * A paragraph with a site-defined size variant (e.g. "small" or "large").
 *
 * The size lives on the node rather than inside its text, so it never affects
 * the paragraph's translation key. It is mirrored onto the editor DOM as
 * `data-size`, which is also how sites render it, so a site's own CSS could
 * style either surface the same way.
 *
 * Unsized paragraphs keep using lexical's built-in `ParagraphNode`: this node
 * is only created when an editor explicitly picks a size, which leaves the
 * behavior of every existing rich text field unchanged.
 */
export class SizedParagraphNode extends ParagraphNode {
  // Named `__paragraphSize` rather than `__size`: `ElementNode.__size` is
  // lexical's own child count.
  __paragraphSize: RichTextParagraphSize;

  static getType(): string {
    return 'sized-paragraph';
  }

  static clone(node: SizedParagraphNode): SizedParagraphNode {
    return new SizedParagraphNode(node.__paragraphSize, node.__key);
  }

  static importJSON(
    serializedNode: SerializedSizedParagraphNode
  ): SizedParagraphNode {
    // An unusable stored value degrades to an ordinary paragraph rather than
    // an unlabelable one.
    const size = parseRichTextParagraphSize(serializedNode.size) || '';
    return new SizedParagraphNode(size).updateFromJSON(serializedNode);
  }

  constructor(size: RichTextParagraphSize, key?: NodeKey) {
    super(key);
    this.__paragraphSize = size;
  }

  exportJSON(): SerializedSizedParagraphNode {
    return {
      ...super.exportJSON(),
      type: 'sized-paragraph',
      size: this.__paragraphSize,
    };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    applyParagraphSizeToDOM(dom, config, this.__paragraphSize);
    return dom;
  }

  updateDOM(
    prevNode: SizedParagraphNode,
    dom: HTMLElement,
    config: EditorConfig
  ): boolean {
    if (prevNode.__paragraphSize !== this.__paragraphSize) {
      applyParagraphSizeToDOM(dom, config, this.__paragraphSize);
    }
    return super.updateDOM(prevNode, dom, config);
  }

  /**
   * Carries the size forward when the editor presses Enter, matching the
   * behavior of other editors (a new paragraph keeps the current size).
   */
  insertNewAfter(
    rangeSelection: RangeSelection,
    restoreSelection: boolean
  ): ParagraphNode {
    const newElement = $createSizedParagraphNode(this.__paragraphSize);
    newElement.setTextFormat(rangeSelection.format);
    newElement.setTextStyle(rangeSelection.style);
    newElement.setDirection(this.getDirection());
    newElement.setFormat(this.getFormatType());
    newElement.setStyle(this.getStyle());
    this.insertAfter(newElement, restoreSelection);
    return newElement;
  }

  getParagraphSize(): RichTextParagraphSize {
    return this.getLatest().__paragraphSize;
  }

  setParagraphSize(size: RichTextParagraphSize): this {
    const writable = this.getWritable();
    writable.__paragraphSize = size;
    return writable;
  }
}

/**
 * Mirrors the size onto the editor DOM as `data-size`, and applies the preview
 * font size the field's schema declared for it (if any).
 *
 * The font size is an editor-only affordance: the published page carries the
 * `data-size` attribute alone and is styled by the site's own CSS.
 */
function applyParagraphSizeToDOM(
  dom: HTMLElement,
  config: EditorConfig,
  size: RichTextParagraphSize
) {
  if (!size) {
    dom.removeAttribute('data-size');
    dom.style.removeProperty('font-size');
    return;
  }
  dom.setAttribute('data-size', size);
  const fontSizes = config.theme.paragraphSizeFontSizes as
    | Record<string, string>
    | undefined;
  const fontSize = fontSizes?.[size];
  if (fontSize) {
    dom.style.fontSize = fontSize;
  } else {
    dom.style.removeProperty('font-size');
  }
}

export function $createSizedParagraphNode(
  size: RichTextParagraphSize
): SizedParagraphNode {
  return new SizedParagraphNode(size);
}

export function $isSizedParagraphNode(
  node: LexicalNode | null | undefined
): node is SizedParagraphNode {
  return node instanceof SizedParagraphNode;
}

/**
 * Returns the size variant of a paragraph node, or `undefined` when the node
 * is an ordinary (unsized) paragraph.
 */
export function $getParagraphSize(
  node: LexicalNode | null | undefined
): RichTextParagraphSize | undefined {
  if (!$isSizedParagraphNode(node)) {
    return undefined;
  }
  return node.getParagraphSize() || undefined;
}
