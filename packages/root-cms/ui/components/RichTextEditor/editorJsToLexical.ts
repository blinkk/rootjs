import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
  LexicalEditor,
  LexicalNode,
  ParagraphNode,
  RootNode,
  TextNode,
  HeadingNode,
  ListNode,
  ListItemNode,
  SerializedEditorState,
  SerializedLexicalNode,
  $createHeadingNode,
  $createListNode,
  $createListItemNode,
  LineBreakNode,
  ElementNode,
} from 'lexical';
import {$generateNodesFromDOM} from '@lexical/html';
import {createHeadlessEditor} from '@lexical/headless';

// Custom Nodes & Local Types
import {ImageNode, $createImageNode, ImagePayload} from './ImageNode';
import {LinkNode} from '@lexical/link'; // Assuming LinkNode might be part of HTML
import {RichTextData, RichTextBlock, RichTextBlockDataItem} from './lexicalToEditorJS'; // Reuse types

// All nodes that might be encountered during HTML parsing or direct creation
const ALL_NODES = [
  RootNode,
  ParagraphNode,
  TextNode,
  LineBreakNode,
  HeadingNode,
  ListNode,
  ListItemNode,
  LinkNode,
  ImageNode,
  // Add any other nodes like QuoteNode, CodeNode if they are used or expected from HTML
];

// --- HTML Deserialization Helper ---
// Creates a temporary headless editor to parse HTML strings into Lexical nodes
function htmlToLexicalNodes(htmlString: string, headlessEditor: LexicalEditor): LexicalNode[] {
  if (!htmlString) {
    return [];
  }
  const domParser = new DOMParser();
  const dom = domParser.parseFromString(htmlString, 'text/html');
  
  // $generateNodesFromDOM should be called within an editor update cycle
  let nodes: LexicalNode[] = [];
  headlessEditor.update(() => {
    nodes = $generateNodesFromDOM(headlessEditor, dom.body);
  });
  return nodes;
}

// --- Main Conversion Function ---
export function convertEditorJSToLexical(editorJSData: RichTextData): SerializedEditorState {
  const lexicalNodes: SerializedLexicalNode[] = [];

  const headlessEditor = createHeadlessEditor({
    nodes: ALL_NODES,
    onError: (error) => {
      console.error('Headless editor error during EditorJS to Lexical conversion:', error);
    },
  });

  for (const block of editorJSData.blocks) {
    let generatedNodes: LexicalNode[] = [];

    switch (block.type) {
      case 'paragraph':
        if (block.data.text) {
          // Wrap the parsed nodes in a paragraph if they aren't already block-level
          headlessEditor.update(() => {
            const p = $createParagraphNode();
            const parsedChildren = htmlToLexicalNodes(block.data.text!, headlessEditor);
            parsedChildren.forEach(child => p.append(child));
            generatedNodes.push(p);
          });
        }
        break;

      case 'heading':
        if (block.data.text && block.data.level) {
          headlessEditor.update(() => {
            const headingTag = `h${block.data.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
            const heading = $createHeadingNode(headingTag);
            const parsedChildren = htmlToLexicalNodes(block.data.text!, headlessEditor);
            parsedChildren.forEach(child => heading.append(child));
            generatedNodes.push(heading);
          });
        }
        break;

      case 'image':
        if (block.data.file) {
          headlessEditor.update(() => {
            const imagePayload: ImagePayload = {
              src: block.data.file!.url,
              altText: block.data.file!.alt || '',
              width: block.data.file!.width,
              height: block.data.file!.height,
            };
            generatedNodes.push($createImageNode(imagePayload));
          });
        }
        break;
      
      case 'orderedList':
      case 'unorderedList':
        if (block.data.items && block.data.items.length > 0) {
          headlessEditor.update(() => {
            const listType = block.type === 'orderedList' ? 'ol' : 'ul';
            const listNode = $createListNode(listType);
            
            function processListItems(items: Array<string | RichTextBlockDataItem>, parentListNode: ListNode) {
              for (const item of items) {
                const listItemNode = $createListItemNode();
                if (typeof item === 'string') {
                  const parsedChildren = htmlToLexicalNodes(item, headlessEditor);
                  parsedChildren.forEach(child => listItemNode.append(child));
                } else { // RichTextBlockDataItem
                  if (item.content) {
                    const parsedChildren = htmlToLexicalNodes(item.content, headlessEditor);
                    parsedChildren.forEach(child => listItemNode.append(child));
                  }
                  if (item.items && item.items.length > 0) {
                    // This is a nested list
                    const nestedListNode = $createListNode(parentListNode.getListType() as 'ol' | 'ul'); // Assuming same type for now
                    processListItems(item.items, nestedListNode); // Recursive call
                    listItemNode.append(nestedListNode);
                  }
                }
                parentListNode.append(listItemNode);
              }
            }
            processListItems(block.data.items!, listNode);
            generatedNodes.push(listNode);
          });
        }
        break;

      case 'html':
        if (block.data.html) {
           headlessEditor.update(() => {
            // HTML blocks can contain multiple block-level elements.
            // $generateNodesFromDOM will produce an array. Add them directly.
            const parsedNodes = htmlToLexicalNodes(block.data.html!, headlessEditor);
            generatedNodes.push(...parsedNodes);
           });
        }
        break;

      default:
        console.warn(`Unsupported EditorJS block type: ${block.type}`);
        // Optionally create a fallback paragraph or skip
        break;
    }
    
    // Convert live nodes to serializable nodes
    if (generatedNodes.length > 0) {
      headlessEditor.update(() => { // Ensure we are in an update cycle for toJSON
        generatedNodes.forEach(node => {
          // If a node like ParagraphNode was created and then its children were appended,
          // it should already be in the correct state for toJSON().
          // If htmlToLexicalNodes returned ElementNodes that should be top-level,
          // they are added directly.
          lexicalNodes.push(node.exportJSON());
        });
      });
    }
  }

  // Construct the final EditorState JSON
  const editorStateJSON: SerializedEditorState = {
    root: {
      children: lexicalNodes,
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  };

  return editorStateJSON;
}
