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
  RichTextInlineComponentsMap,
  RichTextListBlock,
  RichTextListItem,
  RichTextParagraphBlock,
} from '../../../../../shared/richtext.js';
import {cloneData} from '../../../../utils/objects.js';
import {$isCustomBlockNode} from '../nodes/CustomBlockNode.js';
import {$isInlineComponentNode} from '../nodes/InlineComponentNode.js';

interface TextExtractionResult {
  text: string;
  components: RichTextInlineComponentsMap;
}

function createEmptyExtractionResult(): TextExtractionResult {
  return {text: '', components: {}};
}

function mergeTextExtractionResults(
  results: TextExtractionResult[]
): TextExtractionResult {
  const merged: TextExtractionResult = createEmptyExtractionResult();
  results.forEach((result) => {
    merged.text += result.text;
    Object.assign(merged.components, result.components);
  });
  return merged;
}

function extractTextNode(node: ElementNode): TextExtractionResult {
  const texts = node.getChildren().map(extractTextChild);
  return mergeTextExtractionResults(texts);
}

function extractTextChild(node: LexicalNode): TextExtractionResult {
  if ($isLineBreakNode(node)) {
    return {text: '<br>', components: {}};
  }
  if ($isLinkNode(node)) {
    const href = node.getURL();
    const result = extractTextNode(node);
    return {
      text: `<a href="${href}">${result.text}</a>`,
      components: result.components,
    };
  }
  if ($isInlineComponentNode(node)) {
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
      text: `{component:${componentId}}`,
      components,
    };
  }
  if (!$isTextNode(node)) {
    console.log('unhandled node');
    console.log(node);
    return createEmptyExtractionResult();
  }
  const text = node.getTextContent();
  if (!text) {
    return createEmptyExtractionResult();
  }
  const formatTags = {
    s: node.hasFormat('strikethrough'),
    u: node.hasFormat('underline'),
    i: node.hasFormat('italic'),
    b: node.hasFormat('bold'),
    sup: node.hasFormat('superscript'),
  };
  return {
    text: formatTextNode(text, formatTags),
    components: {},
  };
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
  const result = extractTextNode(node);
  const item: RichTextListItem = {content: result.text};
  if (hasInlineComponents(result.components)) {
    item.components = result.components;
  }
  return item;
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
    } else if ($isCustomBlockNode(node)) {
      const block: RichTextBlock = {
        type: node.getBlockName(),
        data: cloneData(node.getBlockData()),
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

function hasInlineComponents(components: RichTextInlineComponentsMap | undefined) {
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
