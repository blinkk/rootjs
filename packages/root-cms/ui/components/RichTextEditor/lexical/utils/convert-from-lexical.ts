import {$isLinkNode} from '@lexical/link';
import {
  $isListItemNode,
  $isListNode,
  ListItemNode,
  ListNode,
} from '@lexical/list';
import {$isHeadingNode} from '@lexical/rich-text';
import {
  $getRoot,
  $isParagraphNode,
  $isTextNode,
  LexicalNode,
  ElementNode,
  $isLineBreakNode,
} from 'lexical';
import {
  RichTextBlock,
  RichTextData,
  RichTextHeadingBlock,
  RichTextListBlock,
  RichTextListItem,
  RichTextParagraphBlock,
} from '../../../../../shared/richtext.js';

function extractTextNode(node: ElementNode) {
  const texts = node.getChildren().map(extractTextChild);
  return texts.join('');
}

function extractTextChild(node: LexicalNode): string {
  if ($isLineBreakNode(node)) {
    return '<br>';
  }
  if ($isLinkNode(node)) {
    const href = node.getURL();
    return `<a href="${href}">${extractTextNode(node)}</a>`;
  }
  if (!$isTextNode(node)) {
    console.log('unhandled node');
    console.log(node);
    return '';
  }
  const text = node.getTextContent();
  if (!text) {
    return '';
  }
  const formatTags = {
    s: node.hasFormat('strikethrough'),
    u: node.hasFormat('underline'),
    i: node.hasFormat('italic'),
    b: node.hasFormat('bold'),
    sup: node.hasFormat('superscript'),
  };
  return formatTextNode(text, formatTags);
}

function formatTextNode(text: string, formatTags: Record<string, boolean>) {
  const segments: string[] = [];
  Object.entries(formatTags).forEach(([tag, enabled]) => {
    if (enabled) {
      segments.push(`<${tag}>`);
    }
  });
  segments.push(escapeHTML(text));
  Object.entries(formatTags).forEach(([tag, enabled]) => {
    if (enabled) {
      segments.push(`</${tag}>`);
    }
  });
  return segments.join('');
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
  return {content: extractTextNode(node)};
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
      const block: RichTextParagraphBlock = {
        type: 'paragraph',
        data: {text: extractTextNode(node)},
      };
      blocks.push(block);
    } else if ($isHeadingNode(node)) {
      const level = node.getTag().slice(1);
      const block: RichTextHeadingBlock = {
        type: 'heading',
        data: {
          text: extractTextNode(node),
          level: parseInt(level),
        },
      };
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
  if (lastBlock && lastBlock.type === 'paragraph' && !lastBlock.data?.text) {
    return true;
  }
  return false;
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
