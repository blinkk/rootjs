import {DecoratorNode, EditorConfig, LexicalNode, NodeKey, SerializedLexicalNode, Spread} from 'lexical';
import {JSX} from 'preact/jsx-runtime';

export interface HTMLCodeProps {
  internalDesc?: string;
  html: string;
  nodeKey?: NodeKey;
}

export type SerializedHTMLCodeNode = Spread<
  {
    internalDesc: string;
    html: string;
  },
  SerializedLexicalNode
>;

/**
 * Node for HTML code embeds.
 */
export class HTMLCodeNode extends DecoratorNode<JSX.Element> {
  __internalDesc: string;
  __html: string;

  static getType(): string {
    return 'html';
  }

  static clone(node: HTMLCodeNode): HTMLCodeNode {
    return new HTMLCodeNode(node.__internalDesc, node.__html);
  }

  constructor(internalDesc: string, html: string, key?: NodeKey) {
    super(key);
    this.__internalDesc = internalDesc;
    this.__html = html;
  }

  setInternalDesc(internalDesc: string) {
    this.__internalDesc = internalDesc;
  }

  getInternalDesc(): string {
    return this.__internalDesc;
  }

  setHTML(html: string) {
    this.__html = html;
  }

  getHTML() {
    return this.__html;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const div = document.createElement('div');
    const theme = config.theme;
    const className = theme.htmlCode;
    if (className) {
      div.className = className;
    }
    return div;
  }

  updateDOM() {
    return false;
  }

  decorate(): JSX.Element {
    return (
      <HTMLCodeComponent html={this.__html} nodeKey={this.getKey()} />
    );
  }

  static importJSON(serializedNode: SerializedHTMLCodeNode): HTMLCodeNode {
    return $createHTMLCodeNode(serializedNode.internalDesc, serializedNode.html).updateFromJSON(
      serializedNode,
    );
  }

  exportJSON(): SerializedHTMLCodeNode {
    return {
      ...super.exportJSON(),
      internalDesc: this.__internalDesc,
      html: this.__html,
    };
  }
}

function HTMLCodeComponent(props: HTMLCodeProps) {
  return <div>HTML Code: {props.internalDesc}</div>;
}

export function $createHTMLCodeNode(internalDesc: string, html: string): HTMLCodeNode {
  return new HTMLCodeNode(internalDesc, html);
}

export function $isHTMLCodeNode(
  node: HTMLCodeNode | LexicalNode | null | undefined,
): node is HTMLCodeNode {
  return node instanceof HTMLCodeNode;
}
