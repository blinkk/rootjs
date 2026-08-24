import {AutoLinkNode, LinkNode} from '@lexical/link';
import {ListItemNode, ListNode} from '@lexical/list';
import {HorizontalRuleNode} from '@lexical/react/LexicalHorizontalRuleNode';
import {HeadingNode, QuoteNode} from '@lexical/rich-text';
import {TableCellNode, TableNode, TableRowNode} from '@lexical/table';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  createEditor,
  LexicalEditor,
} from 'lexical';
import {describe, expect, test} from 'vitest';
import {RichTextData} from '../../../../../shared/richtext.js';
import {BlockComponentNode} from '../nodes/BlockComponentNode.js';
import {InlineComponentNode} from '../nodes/InlineComponentNode.js';
import {
  $getParagraphSize,
  SizedParagraphNode,
} from '../nodes/SizedParagraphNode.js';
import {SpecialCharacterNode} from '../nodes/SpecialCharacterNode.js';
import {convertToRichTextData} from './convert-from-lexical.js';
import {convertToLexical} from './convert-to-lexical.js';

/** Headless editor registering the same nodes as `<LexicalEditor>`. */
function createTestEditor(): LexicalEditor {
  return createEditor({
    namespace: 'RootCMS',
    nodes: [
      AutoLinkNode,
      HeadingNode,
      QuoteNode,
      LinkNode,
      ListNode,
      ListItemNode,
      HorizontalRuleNode,
      TableNode,
      TableCellNode,
      TableRowNode,
      BlockComponentNode,
      InlineComponentNode,
      SizedParagraphNode,
      SpecialCharacterNode,
    ],
    onError: (err: Error) => {
      throw err;
    },
  });
}

/** Loads rich text data into an editor and reads it back out. */
function roundTrip(data: RichTextData): RichTextData | null {
  const editor = createTestEditor();
  editor.update(() => convertToLexical(data), {discrete: true});
  let result: RichTextData | null = null;
  editor.read(() => {
    result = convertToRichTextData();
  });
  return result;
}

const SIZED_PARAGRAPHS: RichTextData = {
  version: '1',
  time: 0,
  blocks: [
    {type: 'paragraph', data: {text: 'Normal paragraph.'}},
    {type: 'paragraph', data: {size: 'small', text: 'Small paragraph.'}},
    {type: 'paragraph', data: {size: 'large', text: 'Large paragraph.'}},
    // The sizes are site-defined, so an arbitrary value must survive too.
    {type: 'paragraph', data: {size: 'body-3', text: 'Custom paragraph.'}},
    {
      type: 'table',
      data: {
        rows: [
          {
            cells: [
              {
                type: 'data',
                blocks: [
                  {type: 'paragraph', data: {size: 'small', text: 'In cell.'}},
                ],
              },
            ],
          },
        ],
      },
    },
  ],
};

describe('paragraph sizes', () => {
  test('round-trip preserves sizes at the root and inside tables', () => {
    expect(roundTrip(SIZED_PARAGRAPHS)?.blocks).toEqual(
      SIZED_PARAGRAPHS.blocks
    );
  });

  test('unsized paragraphs never gain a size', () => {
    const result = roundTrip({
      version: '1',
      time: 0,
      blocks: [
        {type: 'paragraph', data: {text: 'Normal paragraph.'}},
        {type: 'heading', data: {level: 2, text: 'A heading.'}},
      ],
    });
    expect(result?.blocks[0]).toEqual({
      type: 'paragraph',
      data: {text: 'Normal paragraph.'},
    });
  });

  test('an unusable stored size degrades to a normal paragraph', () => {
    const result = roundTrip({
      version: '1',
      time: 0,
      blocks: [
        {type: 'paragraph', data: {size: '', text: 'Empty size.'}},
        {type: 'paragraph', data: {size: 42, text: 'Numeric size.'}} as any,
      ],
    });
    expect(result?.blocks).toEqual([
      {type: 'paragraph', data: {text: 'Empty size.'}},
      {type: 'paragraph', data: {text: 'Numeric size.'}},
    ]);
  });

  test('pressing enter carries the size to the next paragraph', () => {
    const editor = createTestEditor();
    editor.update(
      () =>
        convertToLexical({
          version: '1',
          time: 0,
          blocks: [{type: 'paragraph', data: {size: 'small', text: 'First.'}}],
        }),
      {discrete: true}
    );
    editor.update(
      () => {
        $getRoot().getFirstChildOrThrow<SizedParagraphNode>().selectEnd();
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selection.insertParagraph();
        }
      },
      {discrete: true}
    );

    let result: RichTextData | null = null;
    editor.read(() => {
      result = convertToRichTextData();
    });
    // The trailing paragraph is empty, so it is dropped on save; typing into
    // it is what makes the carried-over size observable.
    expect(result?.blocks).toEqual([
      {type: 'paragraph', data: {size: 'small', text: 'First.'}},
    ]);
    editor.read(() => {
      const nodes = $getRoot().getChildren();
      expect(nodes).toHaveLength(2);
      expect($getParagraphSize(nodes[1])).toBe('small');
    });
  });

  test('sizes survive lexical serialization (the internal clipboard path)', () => {
    const editor = createTestEditor();
    editor.update(() => convertToLexical(SIZED_PARAGRAPHS), {discrete: true});

    // Serializing and reparsing is what copy/paste between rich text fields
    // does, and it goes through the node's exportJSON/importJSON rather than
    // through the converters.
    const json = JSON.parse(JSON.stringify(editor.getEditorState().toJSON()));
    editor.setEditorState(editor.parseEditorState(json));

    let result: RichTextData | null = null;
    editor.read(() => {
      result = convertToRichTextData();
    });
    expect(result?.blocks).toEqual(SIZED_PARAGRAPHS.blocks);
  });
});
