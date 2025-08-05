import {$createLinkNode} from '@lexical/link';
import {
  $createListItemNode,
  $createListNode,
  ListItemNode,
} from '@lexical/list';
import {$createHeadingNode, HeadingTagType} from '@lexical/rich-text';
import {
  $applyNodeReplacement,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
} from 'lexical';
import {
  RichTextData,
  RichTextListItem,
} from '../../../../../shared/richtext.js';

/**
 * Converts from lexical to rich text data and writes the output directly to
 * the current editor.
 * NOTE: this function must be called within an `editor.update()` callback.
 */
export function convertToLexical(data?: RichTextData | null) {
  const root = $getRoot();
  root.clear();

  const blocks = data?.blocks || [];
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      const paragraphNode = $createParagraphNode();
      if (block.data.text) {
        const children = createNodesFromHTML(block.data.text);
        paragraphNode.append(...children);
      }
      root.append(paragraphNode);
    } else if (block.type === 'heading') {
      const tagName = `h${block.data?.level || 2}` as HeadingTagType;
      const headingNode = $createHeadingNode(tagName);
      if (block.data.text) {
        const children = createNodesFromHTML(block.data.text);
        headingNode.append(...children);
      }
      root.append(headingNode);
    } else if (block.type === 'orderedList' || block.type === 'unorderedList') {
      const style = block.data.style === 'ordered' ? 'number' : 'bullet';
      const listNode = $createListNode(style);
      for (const item of block.data.items) {
        listNode.append(...createListItemNodes(item, style));
      }
      root.append(listNode);
    }
  }
}

function createNodesFromHTML(htmlString: string) {
  const template = document.createElement('template');
  template.innerHTML = htmlString;
  const fragment = template.content;

  const nodes: any[] = [];

  function parseNode(domNode: Node): any {
    if (domNode.nodeType === Node.TEXT_NODE) {
      return $createTextNode(domNode.textContent || '');
    }

    if (domNode.nodeType === Node.ELEMENT_NODE) {
      const el = domNode as HTMLElement;
      const children = Array.from(el.childNodes)
        .map(parseNode)
        .filter(Boolean)
        .flat();

      switch (el.tagName.toLowerCase()) {
        case 'b':
        case 'strong':
          return children.map((child) => {
            child.toggleFormat('bold');
            return child;
          });
        case 'i':
        case 'em':
          return children.map((child) => {
            child.toggleFormat('italic');
            return child;
          });
        case 'u':
          return children.map((child) => {
            child.toggleFormat('underline');
            return child;
          });
        case 's':
          return children.map((child) => {
            child.toggleFormat('strikethrough');
            return child;
          });
        case 'sup':
          return children.map((child) => {
            child.toggleFormat('superscript');
            return child;
          });
        case 'a':
          return [
            $applyNodeReplacement(
              $createLinkNode(el.getAttribute('href') || '').append(...children)
            ),
          ];
        default:
          console.log('unhandled tag: ' + el.tagName);
          console.log(children);
          return children;
      }
    }

    return null;
  }

  fragment.childNodes.forEach((node) => {
    const parsed = parseNode(node);
    if (Array.isArray(parsed)) {
      nodes.push(...parsed);
    } else if (parsed) {
      nodes.push(parsed);
    }
  });

  return nodes;
}

function createListItemNodes(
  listItem: RichTextListItem,
  parentStyle: 'number' | 'bullet'
) {
  const nodes: ListItemNode[] = [];
  if (listItem.content) {
    const itemNode = createListItemTextNode(listItem, parentStyle);
    nodes.push(itemNode);
  }
  if (listItem.items && listItem.items.length > 0) {
    const itemNode = createListItemNestedListNode(listItem, parentStyle);
    nodes.push(itemNode);
  }
  return nodes;
}

function createListItemTextNode(
  listItem: RichTextListItem,
  parentStyle: 'number' | 'bullet'
) {
  const listItemNode = $createListItemNode();

  if (listItem.content) {
    const children = createNodesFromHTML(listItem.content);
    listItemNode.append(...children);
  }

  return listItemNode;
}

function createListItemNestedListNode(
  listItem: RichTextListItem,
  parentStyle: 'number' | 'bullet'
) {
  const listItemNode = $createListItemNode();

  if (listItem.items && listItem.items.length > 0) {
    let style: 'number' | 'bullet' = parentStyle;
    if (listItem.itemsType === 'orderedList') {
      style = 'number';
    } else if (listItem.itemsType === 'unorderedList') {
      style = 'bullet';
    }
    const nestedListNode = $createListNode(style);
    for (const item of listItem.items) {
      nestedListNode.append(...createListItemNodes(item, style));
    }
    listItemNode.append(nestedListNode);
  }

  return listItemNode;
}
