import {$createLinkNode} from '@lexical/link';
import {
  $createListItemNode,
  $createListNode,
  ListItemNode,
} from '@lexical/list';
import {$createHorizontalRuleNode} from '@lexical/react/LexicalHorizontalRuleNode';
import {
  $createHeadingNode,
  $createQuoteNode,
  HeadingTagType,
} from '@lexical/rich-text';
import {
  $createTableNode,
  $createTableRowNode,
  $createTableCellNode,
} from '@lexical/table';
import {
  $applyNodeReplacement,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  LexicalNode,
  TextNode,
} from 'lexical';
import {
  RichTextData,
  RichTextInlineComponentsMap,
  RichTextListItem,
} from '../../../../../shared/richtext.js';
import {cloneData} from '../../../../utils/objects.js';
import {$createBlockComponentNode} from '../nodes/BlockComponentNode.js';
import {$createInlineComponentNode} from '../nodes/InlineComponentNode.js';

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
        const children = createNodesFromHTML(
          block.data.text,
          block.data.components
        );
        paragraphNode.append(...children);
      }
      root.append(paragraphNode);
    } else if (block.type === 'heading') {
      const tagName = `h${block.data?.level || 2}` as HeadingTagType;
      const headingNode = $createHeadingNode(tagName);
      if (block.data.text) {
        const children = createNodesFromHTML(
          block.data.text,
          block.data.components
        );
        headingNode.append(...children);
      }
      root.append(headingNode);
    } else if (block.type === 'quote') {
      const quoteNode = $createQuoteNode();
      if (block.data?.text) {
        const children = createNodesFromHTML(
          block.data.text,
          block.data.components
        );
        quoteNode.append(...children);
      }
      root.append(quoteNode);
    } else if (block.type === 'orderedList' || block.type === 'unorderedList') {
      const style = block.data.style === 'ordered' ? 'number' : 'bullet';
      const listNode = $createListNode(style);
      for (const item of block.data.items) {
        listNode.append(...createListItemNodes(item, style));
      }
      root.append(listNode);
    } else if (block.type === 'table') {
      // Handle table blocks with nested rows/cells structure
      const tableNode = $createTableNode();
      const rows = block.data?.rows || [];

      rows.forEach((row: any) => {
        const rowNode = $createTableRowNode();
        const cells = row.cells || [];

        cells.forEach((cell: any) => {
          const cellBlocks = cell.blocks || [];
          const cellType = cell.type || 'data';
          // Convert type to header state: 'header' -> 1, 'data' -> 0
          const headerState = cellType === 'header' ? 1 : 0;
          const cellNode = $createTableCellNode(headerState);

          // Process each block in the cell
          cellBlocks.forEach((cellBlock: any) => {
            if (cellBlock.type === 'paragraph') {
              const paragraphNode = $createParagraphNode();
              if (cellBlock.data?.text) {
                const children = createNodesFromHTML(
                  cellBlock.data.text,
                  cellBlock.data.components
                );
                paragraphNode.append(...children);
              }
              cellNode.append(paragraphNode);
            } else if (cellBlock.type === 'heading') {
              const tagName = `h${
                cellBlock.data?.level || 2
              }` as HeadingTagType;
              const headingNode = $createHeadingNode(tagName);
              if (cellBlock.data?.text) {
                const children = createNodesFromHTML(
                  cellBlock.data.text,
                  cellBlock.data.components
                );
                headingNode.append(...children);
              }
              cellNode.append(headingNode);
            } else if (cellBlock.type === 'quote') {
              const quoteNode = $createQuoteNode();
              if (cellBlock.data?.text) {
                const children = createNodesFromHTML(
                  cellBlock.data.text,
                  cellBlock.data.components
                );
                quoteNode.append(...children);
              }
              cellNode.append(quoteNode);
            } else if (
              cellBlock.type === 'orderedList' ||
              cellBlock.type === 'unorderedList'
            ) {
              const style =
                cellBlock.data.style === 'ordered' ? 'number' : 'bullet';
              const listNode = $createListNode(style);
              for (const item of cellBlock.data.items) {
                listNode.append(...createListItemNodes(item, style));
              }
              cellNode.append(listNode);
            } else {
              // Block component
              const blockComponentNode = $createBlockComponentNode(
                cellBlock.type,
                cellBlock.data || {}
              );
              cellNode.append(blockComponentNode);
            }
          });

          rowNode.append(cellNode);
        });

        tableNode.append(rowNode);
      });

      root.append(tableNode);
    } else if (block.type === 'delimiter') {
      // Handle horizontal rule / delimiter blocks
      const hrNode = $createHorizontalRuleNode();
      root.append(hrNode);
    } else if (block.type) {
      const node = $createBlockComponentNode(block.type, block.data || {});
      root.append(node);
    }
  }
}

function createNodesFromHTML(
  htmlString: string,
  components?: RichTextInlineComponentsMap
) {
  const template = document.createElement('template');
  template.innerHTML = htmlString;
  const fragment = template.content;

  const nodes: LexicalNode[] = [];

  function parseNode(domNode: Node): LexicalNode | Array<LexicalNode> | null {
    if (domNode.nodeType === Node.TEXT_NODE) {
      return createNodesFromTextContent(domNode.textContent || '', components);
    }

    if (domNode.nodeType === Node.ELEMENT_NODE) {
      const el = domNode as HTMLElement;
      const children: LexicalNode[] = Array.from(el.childNodes)
        .map(parseNode)
        .filter((node) => !!node)
        .flat();

      switch (el.tagName.toLowerCase()) {
        case 'b':
        case 'strong':
          return children.map((child: LexicalNode) => {
            if (child instanceof TextNode) {
              child.toggleFormat('bold');
            }
            return child;
          });
        case 'i':
        case 'em':
          return children.map((child: LexicalNode) => {
            if (child instanceof TextNode) {
              child.toggleFormat('italic');
            }
            return child;
          });
        case 'u':
          return children.map((child: LexicalNode) => {
            if (child instanceof TextNode) {
              child.toggleFormat('underline');
            }
            return child;
          });
        case 's':
          return children.map((child: LexicalNode) => {
            if (child instanceof TextNode) {
              child.toggleFormat('strikethrough');
            }
            return child;
          });
        case 'sup':
          return children.map((child: LexicalNode) => {
            if (child instanceof TextNode) {
              child.toggleFormat('superscript');
            }
            return child;
          });
        case 'sub':
          return children.map((child: LexicalNode) => {
            if (child instanceof TextNode) {
              child.toggleFormat('subscript');
            }
            return child;
          });
        case 'code':
          return children.map((child: LexicalNode) => {
            if (child instanceof TextNode) {
              child.toggleFormat('code');
            }
            return child;
          });
        case 'br':
          // Line breaks are handled by Lexical's LineBreakNode
          return [];
        case 'a': {
          const linkNode = $createLinkNode(el.getAttribute('href') || '');
          const target = el.getAttribute('target');
          if (target) {
            linkNode.setTarget(target);
          }
          linkNode.append(...(children as LexicalNode[]));
          return [$applyNodeReplacement(linkNode)];
        }
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

function createNodesFromTextContent(
  textContent: string,
  components?: RichTextInlineComponentsMap
): LexicalNode[] {
  const nodes: LexicalNode[] = [];
  if (!textContent) {
    return nodes;
  }

  const pattern = /\{([^:{}]+):([^}]+)\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(textContent)) !== null) {
    const preceding = textContent.slice(lastIndex, match.index);
    if (preceding) {
      nodes.push($createTextNode(preceding));
    }

    const componentType = match[1];
    const componentId = match[2];
    const component = components?.[componentId];
    if (component) {
      nodes.push(
        $createInlineComponentNode(
          componentType || component.type,
          componentId,
          component.data ? cloneData(component.data) : {}
        )
      );
    } else {
      nodes.push($createTextNode(match[0]));
    }

    lastIndex = pattern.lastIndex;
  }

  const remainder = textContent.slice(lastIndex);
  if (remainder) {
    nodes.push($createTextNode(remainder));
  }

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
    const children = createNodesFromHTML(listItem.content, listItem.components);
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
