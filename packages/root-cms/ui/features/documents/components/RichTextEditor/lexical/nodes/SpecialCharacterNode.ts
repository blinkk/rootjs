import {addClassNamesToElement} from '@lexical/utils';
import {
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedTextNode,
  Spread,
  TextNode,
} from 'lexical';

export type SerializedSpecialCharacterNode = Spread<
  {
    type: 'special-character';
  },
  SerializedTextNode
>;

export class SpecialCharacterNode extends TextNode {
  static getType(): string {
    return 'special-character';
  }

  static clone(node: SpecialCharacterNode): SpecialCharacterNode {
    return new SpecialCharacterNode(node.__text, node.__key);
  }

  static importJSON(
    serializedNode: SerializedSpecialCharacterNode
  ): SpecialCharacterNode {
    return $createSpecialCharacterNode(serializedNode.text);
  }

  constructor(text: string, key?: NodeKey) {
    super(text, key);
  }

  exportJSON(): SerializedSpecialCharacterNode {
    return {
      ...super.exportJSON(),
      type: 'special-character',
    };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    addClassNamesToElement(dom, 'SpecialCharacterNode');
    return dom;
  }

  updateDOM(
    prevNode: SpecialCharacterNode,
    dom: HTMLElement,
    config: EditorConfig
  ): boolean {
    const updated = super.updateDOM(prevNode, dom, config);
    addClassNamesToElement(dom, 'SpecialCharacterNode');
    return updated;
  }

  isTextEntity(): true {
    return true;
  }

  canInsertTextAfter(): boolean {
    return false;
  }
}

export function $createSpecialCharacterNode(
  text: string
): SpecialCharacterNode {
  return new SpecialCharacterNode(text);
}

export function $isSpecialCharacterNode(
  node: LexicalNode | null | undefined
): node is SpecialCharacterNode {
  return node instanceof SpecialCharacterNode;
}
