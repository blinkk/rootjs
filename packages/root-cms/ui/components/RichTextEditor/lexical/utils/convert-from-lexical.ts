import {$isLinkNode} from '@lexical/link';
import {
  $isListItemNode,
  $isListNode,
  ListItemNode,
  ListNode,
} from '@lexical/list';
import {$isHeadingNode, $isQuoteNode} from '@lexical/rich-text';
import {
  $isTableNode,
  $isTableRowNode,
  $isTableCellNode,
  TableNode,
  TableRowNode,
  TableCellNode,
} from '@lexical/table';
import {
  $getRoot,
  $isParagraphNode,
  $isTextNode,
  ElementNode,
  TextNode,
  $isLineBreakNode,
  $isDecoratorNode,
} from 'lexical';
import {
  RichTextBlock,
  RichTextData,
  RichTextHeadingBlock,
  RichTextInlineComponentsMap,
  RichTextListBlock,
  RichTextListItem,
  RichTextParagraphBlock,
} from '../../../../../shared/richtext.js';
import {cloneData} from '../../../../utils/objects.js';
import {$isBlockComponentNode} from '../nodes/BlockComponentNode.js';
import {
  $isInlineComponentNode,
  InlineComponentNode,
} from '../nodes/InlineComponentNode.js';

interface TextExtractionResult {
  text: string;
  components: RichTextInlineComponentsMap;
}

function createEmptyExtractionResult(): TextExtractionResult {
  return {text: '', components: {}};
}

type SupportedFormat =
  | 'strikethrough'
  | 'underline'
  | 'italic'
  | 'bold'
  | 'superscript'
  | 'subscript'
  | 'code';

const FORMAT_TAGS_ORDER: Array<{tag: string; format: SupportedFormat}> = [
  {tag: 'code', format: 'code'},
  {tag: 's', format: 'strikethrough'},
  {tag: 'u', format: 'underline'},
  {tag: 'i', format: 'italic'},
  {tag: 'b', format: 'bold'},
  {tag: 'sup', format: 'superscript'},
  {tag: 'sub', format: 'subscript'},
];

function getTextNodeFormats(node: TextNode) {
  const tags: string[] = [];
  FORMAT_TAGS_ORDER.forEach(({tag, format}) => {
    if (node.hasFormat(format)) {
      tags.push(tag);
    }
  });
  return tags;
}

function appendExtractionResult(
  target: TextExtractionResult,
  source: TextExtractionResult
) {
  target.text += source.text;
  Object.assign(target.components, source.components);
}

function updateActiveFormats(
  activeFormats: string[],
  newFormats: string[],
  result: TextExtractionResult
) {
  for (let i = activeFormats.length - 1; i >= 0; i -= 1) {
    const tag = activeFormats[i];
    if (!newFormats.includes(tag)) {
      result.text += `</${tag}>`;
      activeFormats.splice(i, 1);
    }
  }

  newFormats.forEach((tag) => {
    if (!activeFormats.includes(tag)) {
      result.text += `<${tag}>`;
      activeFormats.push(tag);
    }
  });
}

function closeAllFormats(
  activeFormats: string[],
  result: TextExtractionResult
) {
  for (let i = activeFormats.length - 1; i >= 0; i -= 1) {
    result.text += `</${activeFormats[i]}>`;
  }
  activeFormats.length = 0;
}

function elementMatchesFormats(node: ElementNode, formats: string[]): boolean {
  const children = node.getChildren();
  for (const child of children) {
    if ($isTextNode(child)) {
      const childFormats = getTextNodeFormats(child);
      if (childFormats.length !== formats.length) {
        return false;
      }
      for (let i = 0; i < childFormats.length; i += 1) {
        if (childFormats[i] !== formats[i]) {
          return false;
        }
      }
    } else if ($isLineBreakNode(child) || $isInlineComponentNode(child)) {
      continue;
    } else if (child instanceof ElementNode) {
      if (!elementMatchesFormats(child, formats)) {
        return false;
      }
    } else {
      return false;
    }
  }
  return true;
}

function extractInlineComponent(
  node: InlineComponentNode
): TextExtractionResult {
  const componentId = node.getComponentId();
  const componentName = node.getComponentName();
  const componentData = cloneData(node.getComponentData());
  const components: RichTextInlineComponentsMap = {
    [componentId]: {
      type: componentName,
      data: componentData,
    },
  };
  return {
    text: `{${componentName}:${componentId}}`,
    components,
  };
}

function extractLinkNode(node: ElementNode): TextExtractionResult {
  const href = ($isLinkNode(node) && node.getURL()) || '';
  const result = extractTextNode(node);
  return {
    text: `<a href="${href}">${result.text}</a>`,
    components: result.components,
  };
}

function extractTextNode(node: ElementNode): TextExtractionResult {
  const result = createEmptyExtractionResult();
  const activeFormats: string[] = [];
  const children = node.getChildren();

  children.forEach((child) => {
    if ($isLineBreakNode(child)) {
      result.text += '<br>';
      return;
    }

    if ($isInlineComponentNode(child)) {
      appendExtractionResult(result, extractInlineComponent(child));
      return;
    }

    if ($isTextNode(child)) {
      const formats = getTextNodeFormats(child);
      updateActiveFormats(activeFormats, formats, result);
      const textContent = child.getTextContent();
      if (textContent) {
        result.text += escapeHTML(textContent);
      }
      return;
    }

    if ($isLinkNode(child)) {
      if (
        activeFormats.length > 0 &&
        !elementMatchesFormats(child, activeFormats)
      ) {
        closeAllFormats(activeFormats, result);
      }
      appendExtractionResult(result, extractLinkNode(child));
      return;
    }

    if (child instanceof ElementNode) {
      appendExtractionResult(result, extractTextNode(child));
      return;
    }

    console.log('unhandled node');
    console.log(child);
  });

  if (activeFormats.length > 0) {
    closeAllFormats(activeFormats, result);
  }

  return result;
}

function extractListItems(node: ListNode): RichTextListItem[] {
  const items: RichTextListItem[] = [];
  node.getChildren().forEach((child) => {
    if ($isListItemNode(child)) {
      items.push(extractListItem(child));
    }
  });
  return normalizeListItems(items);
}

function extractListItem(node: ListItemNode): RichTextListItem {
  // Handle list item with nested lists.
  const firstChild = node.getFirstChild();
  if (firstChild && $isListNode(firstChild)) {
    const tag = firstChild.getTag();
    return {
      itemsType: tag === 'ol' ? 'orderedList' : 'unorderedList',
      items: extractListItems(firstChild),
    };
  }

  // Handle list item with text content.
  const result = extractTextNode(node);
  const item: RichTextListItem = {content: result.text};
  if (hasInlineComponents(result.components)) {
    item.components = result.components;
  }
  return item;
}

function extractTableData(node: TableNode) {
  const rows: Array<{
    cells: Array<{
      blocks: RichTextBlock[];
      type: 'header' | 'data';
    }>;
  }> = [];

  node.getChildren().forEach((rowNode: any) => {
    if ($isTableRowNode(rowNode)) {
      const cells: Array<{
        blocks: RichTextBlock[];
        type: 'header' | 'data';
      }> = [];

      (rowNode as TableRowNode).getChildren().forEach((cellNode: any) => {
        if ($isTableCellNode(cellNode)) {
          const headerState = (cellNode as TableCellNode).getHeaderStyles();
          const isHeader = headerState > 0;

          // Extract cell content - could be text nodes or block components
          const cellChildren = (cellNode as TableCellNode).getChildren();
          const cellBlocks: RichTextBlock[] = [];

          cellChildren.forEach((child) => {
            // Check for block components
            if ($isBlockComponentNode(child)) {
              cellBlocks.push({
                type: child.getBlockName(),
                data: cloneData(child.getBlockData()),
              });
            } else if ($isParagraphNode(child)) {
              const result = extractTextNode(child);
              const block: RichTextParagraphBlock = {
                type: 'paragraph',
                data: {
                  text: result.text,
                },
              };
              if (hasInlineComponents(result.components)) {
                block.data!.components = result.components;
              }
              cellBlocks.push(block);
            } else if ($isHeadingNode(child)) {
              const level = child.getTag().slice(1);
              const result = extractTextNode(child);
              const block: RichTextHeadingBlock = {
                type: 'heading',
                data: {
                  text: result.text,
                  level: parseInt(level),
                },
              };
              if (hasInlineComponents(result.components)) {
                block.data!.components = result.components;
              }
              cellBlocks.push(block);
            } else if ($isQuoteNode(child)) {
              const result = extractTextNode(child);
              const block: RichTextBlock = {
                type: 'quote',
                data: {
                  text: result.text,
                },
              };
              if (hasInlineComponents(result.components)) {
                block.data!.components = result.components;
              }
              cellBlocks.push(block);
            } else if ($isListNode(child)) {
              const tag = child.getTag();
              const block: RichTextListBlock = {
                type: tag === 'ol' ? 'orderedList' : 'unorderedList',
                data: {
                  style: tag === 'ol' ? 'ordered' : 'unordered',
                  items: extractListItems(child),
                },
              };
              cellBlocks.push(block);
            }
          });

          cells.push({
            blocks: cellBlocks,
            type: isHeader ? 'header' : 'data',
          });
        }
      });

      rows.push({cells});
    }
  });

  return {rows};
}

/**
 * Converts from lexical to rich text data.
 * NOTE: this function must be called within a `editor.read()` callback.
 */
export function convertToRichTextData(): RichTextData | null {
  const blocks: RichTextBlock[] = [];

  const root = $getRoot();
  const children = root.getChildren();

  children.forEach((node) => {
    if ($isParagraphNode(node)) {
      const result = extractTextNode(node);
      const block: RichTextParagraphBlock = {
        type: 'paragraph',
        data: {
          text: result.text,
        },
      };
      if (hasInlineComponents(result.components)) {
        block.data!.components = result.components;
      }
      blocks.push(block);
    } else if ($isHeadingNode(node)) {
      const level = node.getTag().slice(1);
      const result = extractTextNode(node);
      const block: RichTextHeadingBlock = {
        type: 'heading',
        data: {
          text: result.text,
          level: parseInt(level),
        },
      };
      if (hasInlineComponents(result.components)) {
        block.data!.components = result.components;
      }
      blocks.push(block);
    } else if ($isQuoteNode(node)) {
      const result = extractTextNode(node);
      const block: RichTextBlock = {
        type: 'quote',
        data: {
          text: result.text,
        },
      };
      if (hasInlineComponents(result.components)) {
        block.data!.components = result.components;
      }
      blocks.push(block);
    } else if ($isListNode(node)) {
      const tag = node.getTag();
      const block: RichTextListBlock = {
        type: tag === 'ol' ? 'orderedList' : 'unorderedList',
        data: {
          style: tag === 'ol' ? 'ordered' : 'unordered',
          items: extractListItems(node),
        },
      };
      blocks.push(block);
    } else if ($isTableNode(node)) {
      const tableData = extractTableData(node);
      const block: RichTextBlock = {
        type: 'table',
        data: tableData,
      };
      blocks.push(block);
    } else if ($isBlockComponentNode(node)) {
      const block: RichTextBlock = {
        type: node.getBlockName(),
        data: cloneData(node.getBlockData()),
      };
      blocks.push(block);
    } else if ($isDecoratorNode(node) && node.getType() === 'horizontalrule') {
      // Handle horizontal rule nodes
      const block: RichTextBlock = {
        type: 'delimiter',
        data: {},
      };
      blocks.push(block);
    }
  });

  // If the last block is empty, remove it.
  while (testLastBlockIsEmpty(blocks)) {
    blocks.pop();
  }

  // Use `null` when the RTE is empty, which allows components to use boolean
  // expressions to determine whether to render the RTE field.
  if (blocks.length === 0) {
    return null;
  }

  // NOTE(stevenle): The RTE was originally implemented with EditorJS, the data
  // format is preserved for backward compatibility.
  return {
    time: Date.now(),
    blocks,
    version: 'lexical-0.31.2',
  };
}

function testLastBlockIsEmpty(blocks: RichTextBlock[]) {
  const lastBlock = blocks.length > 0 && blocks.at(-1);
  if (
    lastBlock &&
    lastBlock.type === 'paragraph' &&
    !lastBlock.data?.text &&
    !hasInlineComponents(lastBlock.data?.components || {})
  ) {
    return true;
  }
  return false;
}

function hasInlineComponents(
  components: RichTextInlineComponentsMap | undefined
) {
  if (!components) {
    return false;
  }
  return Object.keys(components).length > 0;
}

function escapeHTML(html: string) {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Normalizes items in a list. This function will "merge" nested lists into the
 * previous item to preserve compatibility with the legacy editorjs impl.
 */
function normalizeListItems(items: RichTextListItem[]) {
  const results: RichTextListItem[] = [];
  items.forEach((item) => {
    if (item.itemsType && item.items && results.length > 0) {
      results.at(-1)!.itemsType = item.itemsType;
      results.at(-1)!.items = item.items;
    } else {
      results.push(item);
    }
  });
  return results;
}
