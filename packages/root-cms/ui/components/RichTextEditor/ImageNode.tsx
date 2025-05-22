import type {
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
  CommandListenerPriority,
  LexicalCommand,
} from 'lexical';

import {DecoratorNode, createCommand} from 'lexical';
import {h} from 'preact'; // Assuming Preact is globally available or correctly aliased

export interface ImagePayload {
  src: string;
  altText?: string;
  width?: number;
  height?: number;
  key?: NodeKey; // Optional: for updating existing images
}

export type SerializedImageNode = Spread<
  {
    src: string;
    altText?: string;
    width?: number;
    height?: number;
    type: 'image'; // Required for deserialization
    version: 1;
  },
  SerializedLexicalNode
>;

// Define the command
export const INSERT_IMAGE_COMMAND: LexicalCommand<ImagePayload> =
  createCommand('INSERT_IMAGE_COMMAND');

function ImageComponent({
  src,
  altText,
  width,
  height,
  nodeKey,
}: {
  src: string;
  altText?: string;
  width?: number;
  height?: number;
  nodeKey: NodeKey;
}) {
  return (
    <img
      src={src}
      alt={altText || ''}
      width={width}
      height={height}
      data-lexical-key={nodeKey} // Good practice for decorator nodes
      style={{maxWidth: '100%', height: height ? `${height}px` : 'auto'}}
    />
  );
}

export class ImageNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __altText?: string;
  __width?: number;
  __height?: number;

  static getType(): string {
    return 'image';
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(
      node.__src,
      node.__altText,
      node.__width,
      node.__height,
      node.__key
    );
  }

  constructor(
    src: string,
    altText?: string,
    width?: number,
    height?: number,
    key?: NodeKey
  ) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__width = width;
    this.__height = height;
  }

  // DOM creation logic (optional if decorate handles everything, but good practice)
  createDOM(config: EditorConfig): HTMLElement {
    const span = document.createElement('span');
    const theme = config.theme;
    const className = theme.image; // Assuming you might add a theme class for images
    if (className !== undefined) {
      span.className = className;
    }
    // The actual img will be rendered by the decorator component
    return span;
  }

  // DOM update logic (can be empty if decorator handles updates)
  updateDOM(
    prevNode: ImageNode,
    dom: HTMLElement,
    config: EditorConfig
  ): boolean {
    // Returning false indicates that the decorator component handles rendering updates.
    return false;
  }

  // Serialization
  static importJSON(serializedNode: SerializedImageNode): ImageNode {
    const {src, altText, width, height} = serializedNode;
    const node = $createImageNode({src, altText, width, height});
    return node;
  }

  exportJSON(): SerializedImageNode {
    return {
      src: this.__src,
      altText: this.__altText,
      width: this.__width,
      height: this.__height,
      type: 'image',
      version: 1,
      ...super.exportJSON(), // For base properties like key
    };
  }

  // Decorator part: returns a JSX element (Preact component)
  decorate(editor: LexicalEditor, config: EditorConfig): JSX.Element {
    return (
      <ImageComponent
        src={this.__src}
        altText={this.__altText}
        width={this.__width}
        height={this.__height}
        nodeKey={this.getKey()}
      />
    );
  }

  // Accessor methods (optional, but good practice)
  getSrc(): string {
    return this.__src;
  }

  getAltText(): string | undefined {
    return this.__altText;
  }
}

export function $createImageNode(payload: ImagePayload): ImageNode {
  return new ImageNode(
    payload.src,
    payload.altText,
    payload.width,
    payload.height,
    payload.key
  );
}

export function $isImageNode(
  node: LexicalNode | null | undefined
): node is ImageNode {
  return node instanceof ImageNode;
}
