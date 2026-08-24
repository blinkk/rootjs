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
    if (this.__paragraphSize) {
      dom.setAttribute('data-size', this.__paragraphSize);
    }
    return dom;
  }

  updateDOM(
    prevNode: SizedParagraphNode,
    dom: HTMLElement,
    config: EditorConfig
  ): boolean {
    if (prevNode.__paragraphSize !== this.__paragraphSize) {
      if (this.__paragraphSize) {
        dom.setAttribute('data-size', this.__paragraphSize);
      } else {
        dom.removeAttribute('data-size');
      }
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
