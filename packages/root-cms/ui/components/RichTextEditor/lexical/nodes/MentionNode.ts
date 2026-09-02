import {addClassNamesToElement} from '@lexical/utils';
import {
  $applyNodeReplacement,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedTextNode,
  Spread,
  TextNode,
} from 'lexical';

export type SerializedMentionNode = Spread<
  {
    type: 'mention';
    email: string;
    version: 1;
  },
  SerializedTextNode
>;

/**
 * Inline `@mention` of a CMS user. Rendered as a single non-editable token
 * whose text is the user's display name (or email) prefixed with `@`. The
 * mentioned user's email is stored separately so the label can be friendly
 * while the mention remains addressable for notifications.
 */
export class MentionNode extends TextNode {
  __email: string;

  static getType(): string {
    return 'mention';
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(node.__email, node.__text, node.__key);
  }

  static importJSON(serializedNode: SerializedMentionNode): MentionNode {
    return $createMentionNode(serializedNode.email, serializedNode.text);
  }

  constructor(email: string, text?: string, key?: NodeKey) {
    super(text ?? `@${email}`, key);
    this.__email = email;
  }

  exportJSON(): SerializedMentionNode {
    return {
      ...super.exportJSON(),
      type: 'mention',
      email: this.__email,
      version: 1,
    };
  }

  getEmail(): string {
    return this.getLatest().__email;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    addClassNamesToElement(dom, 'MentionNode');
    dom.setAttribute('data-mention', this.__email);
    dom.setAttribute('spellcheck', 'false');
    return dom;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    const updated = super.updateDOM(prevNode, dom, config);
    addClassNamesToElement(dom, 'MentionNode');
    dom.setAttribute('data-mention', this.__email);
    return updated;
  }

  isTextEntity(): true {
    return true;
  }

  canInsertTextBefore(): boolean {
    return false;
  }

  canInsertTextAfter(): boolean {
    return false;
  }
}

/**
 * Creates a mention node. The optional `text` is the label shown in the
 * editor and defaults to `@<email>`.
 */
export function $createMentionNode(email: string, text?: string): MentionNode {
  const node = new MentionNode(email.trim().toLowerCase(), text);
  node.setMode('segmented').toggleDirectionless();
  return $applyNodeReplacement(node);
}

export function $isMentionNode(
  node: LexicalNode | null | undefined
): node is MentionNode {
  return node instanceof MentionNode;
}
