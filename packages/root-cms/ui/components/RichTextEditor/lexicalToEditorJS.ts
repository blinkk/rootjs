import {
  // Lexical Nodes
  RootNode as LexicalRootNode, // Renamed to avoid conflict with our RootNode type if any
  ParagraphNode,
  TextNode,
  LineBreakNode,
  HeadingNode,
  ListNode,
  ListItemNode,
  QuoteNode,
  CodeNode,
  LinkNode,
  // Lexical Editor & State
  LexicalEditor,
  EditorState, // For type reference, though we get JSON
  SerializedEditorState,
  SerializedLexicalNode,
  // Node Types from Lexical
  ElementNodeType,
  TextNodeType,
} from 'lexical';
import {$generateHtmlFromNodes} from '@lexical/html'; // May need careful vanilla integration

// Custom Nodes
import {ImageNode, SerializedImageNode} from './ImageNode'; // Assuming ImageNode is in the same directory

// --- Target EditorJS-like Block Structure ---
export interface RichTextBlockData {
  // Paragraph
  text?: string; // HTML string

  // Heading
  level?: number; // e.g., 1, 2, 3, 4, 5

  // Image
  file?: {
    url: string;
    width?: number;
    height?: number;
    alt?: string; // EditorJS uses 'alt', Lexical ImageNode uses 'altText'
  };
  caption?: string; // EditorJS image caption

  // List
  style?: 'ordered' | 'unordered';
  items?: Array<string | RichTextBlockDataItem>; // HTML strings or nested list items

  // HTML
  html?: string;
}

// Used for nested list items that can themselves contain more items
export interface RichTextBlockDataItem {
  content: string; // HTML string for the item
  items: Array<string | RichTextBlockDataItem>;
}


export interface RichTextBlock {
  type: string; // e.g., 'paragraph', 'heading', 'image', 'orderedList', 'unorderedList', 'html'
  data: RichTextBlockData;
}

export interface RichTextData {
  blocks: RichTextBlock[];
  time?: number;
  // version?: string; // Optional EditorJS version
}

// --- HTML Serialization Helper (Placeholder/Initial version) ---
// This is a critical part. We need a way to get HTML from Lexical nodes.
// $generateHtmlFromNodes is from @lexical/html and might require a full editor instance.
// For vanilla JS, we might need a more tailored approach or ensure $generateHtmlFromNodes can work.

// Helper function to generate HTML from an array of Lexical nodes
function generateHtmlContent(nodes: LexicalNode[], editor: LexicalEditor): string {
  if (!nodes || nodes.length === 0) {
    return '';
  }
  // $generateHtmlFromNodes requires an editor instance and should be called within a read/update cycle.
  // We are already inside a read() block in the main converter function when this is called.
  return $generateHtmlFromNodes(editor, nodes);
}


// Processes a single ListItemNode and its children.
// Returns either a string (HTML for simple item) or RichTextBlockDataItem (for item with nested list).
function processListItemNode(
  listItemNode: ListItemNode,
  editor: LexicalEditor
): string | RichTextBlockDataItem {
  let htmlContent = '';
  const nestedListItems: Array<string | RichTextBlockDataItem> = [];
  const contentNodes: LexicalNode[] = [];

  for (const childNode of listItemNode.getChildren()) {
    if (childNode instanceof ListNode) {
      // This is a nested list
      const nestedList = processListNode(childNode, editor);
      // EditorJS expects nested items to be part of the `items` array of the *parent* item's data.
      // So, if `processListNode` returns an array of items, we add them here.
      // This structure is RichTextBlockDataItem[]
      nestedList.forEach(item => nestedListItems.push(item));
    } else {
      // Accumulate nodes that are direct content of this list item
      contentNodes.push(childNode);
    }
  }

  if (contentNodes.length > 0) {
    htmlContent = generateHtmlContent(contentNodes, editor);
  }

  if (nestedListItems.length > 0) {
    return {
      content: htmlContent, // HTML of the current list item's direct content
      items: nestedListItems, // Items of the nested list
    };
  }
  return htmlContent;
}

// Processes a ListNode and returns an array of its items (strings or RichTextBlockDataItems)
function processListNode(
  listNode: ListNode,
  editor: LexicalEditor
): Array<string | RichTextBlockDataItem> {
  const items: Array<string | RichTextBlockDataItem> = [];
  for (const child of listNode.getChildren()) {
    if (child instanceof ListItemNode) {
      items.push(processListItemNode(child, editor));
    } else {
      // This case should ideally not happen if list structure is valid
      console.warn('Unexpected node type inside ListNode:', child.getType());
    }
  }
  return items;
}


// --- Main Conversion Function ---
export function convertLexicalToEditorJS(
  editor: LexicalEditor // Takes live editor instance
): RichTextData {
  const blocks: RichTextBlock[] = [];
  const editorState = editor.getEditorState();

  editorState.read(() => {
    const root = LexicalRootNode.getRoot(); // Get the live root node

    for (const node of root.getChildren()) {
      let block: RichTextBlock | null = null;

      if (node instanceof ParagraphNode) {
        block = {
          type: 'paragraph',
          data: {
            text: generateHtmlContent(node.getChildren(), editor),
          },
        };
      } else if (node instanceof HeadingNode) {
        block = {
          type: 'heading',
          data: {
            text: generateHtmlContent(node.getChildren(), editor),
            level: parseInt(node.getTag().replace('h', ''), 10) || 1,
          },
        };
      } else if (node instanceof ImageNode) { // Custom ImageNode
        block = {
          type: 'image',
          data: {
            file: {
              url: node.getSrc(),
              alt: node.getAltText() || '',
              width: node.getWidth(),
              height: node.getHeight(),
            },
            // caption: node.getCaption(), // If your ImageNode has caption
          },
        };
      } else if (node instanceof ListNode) {
        const listStyle = node.getListType() === 'number' ? 'ordered' : 'unordered';
        const listItems = processListNode(node, editor);

        if (listItems.length > 0) {
          block = {
            type: listStyle === 'ordered' ? 'orderedList' : 'unorderedList',
            data: {
              style: listStyle,
              items: listItems,
            },
          };
        }
      } else if (node instanceof QuoteNode) {
        block = {
          type: 'html', // Or a custom 'quote' type if EditorJS setup handles it
          data: {
            // Wrap the generated HTML from children in blockquote tags
            html: `<blockquote>${generateHtmlContent(node.getChildren(), editor)}</blockquote>`,
          },
        };
      } else if (node instanceof CodeNode) {
        // For CodeNode, EditorJS usually expects plain text content.
        // $generateHtmlFromNodes might produce HTML with spans for syntax highlighting.
        // If EditorJS 'code' block needs plain text, we should extract it.
        // Otherwise, if it takes HTML, this is fine.
        // Assuming EditorJS code block takes HTML (like a <pre><code> block):
        const codeText = node.getTextContent(); // Gets raw text
        block = {
          type: 'html', // Or 'code' if EditorJS block type expects that and handles HTML internally
          data: {
            // Manually wrap in pre/code, as $generateHtmlFromNodes on CodeNode itself might not be what EditorJS wants
             html: `<pre><code>${codeText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`,
          },
        };
      } else {
        console.warn(`Unsupported Lexical node type: ${node.getType()} for EditorJS conversion.`);
        // Fallback: try to convert to an HTML block if it's an ElementNode with children
        if (node.getChildren && typeof node.getChildren === 'function' && node.getChildren().length > 0) {
            try {
                const html = generateHtmlContent(node.getChildren(), editor);
                if (html) {
                    block = { type: 'html', data: { html: `<!-- Unsupported Block Type: ${node.getType()} -->${html}` } };
                }
            } catch (e) {
                console.error(`Error generating HTML for unsupported node type ${node.getType()}:`, e);
            }
        }
      }

      if (block) {
        blocks.push(block);
      }
    }
  });

  return {
    blocks: blocks,
    time: Date.now(),
  };
}
