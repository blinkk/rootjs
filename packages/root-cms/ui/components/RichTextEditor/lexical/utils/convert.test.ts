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
import {
  createRichTextMentionHtml,
  RichTextData,
} from '../../../../../shared/richtext.js';
import {BlockComponentNode} from '../nodes/BlockComponentNode.js';
import {InlineComponentNode} from '../nodes/InlineComponentNode.js';
import {$isMentionNode, MentionNode} from '../nodes/MentionNode.js';
import {
  $getParagraphSize,
  SizedParagraphNode,
} from '../nodes/SizedParagraphNode.js';
import {SpecialCharacterNode} from '../nodes/SpecialCharacterNode.js';
import {convertToRichTextData} from './convert-from-lexical.js';
import {convertToLexical} from './convert-to-lexical.js';

/** Headless editor registering the same nodes as `<LexicalEditor>`. */
function createTestEditor(theme?: Record<string, any>): LexicalEditor {
  return createEditor({
    namespace: 'RootCMS',
    theme,
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
      MentionNode,
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

describe('paragraph size editor preview', () => {
  /** Renders the value into a real DOM tree and returns the paragraphs. */
  function renderParagraphs(theme?: Record<string, any>) {
    const editor = createTestEditor(theme);
    const root = document.createElement('div');
    root.contentEditable = 'true';
    document.body.appendChild(root);
    editor.setRootElement(root);
    editor.update(
      () =>
        convertToLexical({
          version: '1',
          time: 0,
          blocks: [
            {type: 'paragraph', data: {text: 'Normal.'}},
            {type: 'paragraph', data: {size: 'tiny', text: 'Tiny.'}},
            {type: 'paragraph', data: {size: 'huge', text: 'Huge.'}},
          ],
        }),
      {discrete: true}
    );
    return Array.from(root.querySelectorAll('p'));
  }

  test('applies the editor style the schema declared for each size', () => {
    const paragraphs = renderParagraphs({
      paragraphSizeStyles: {
        tiny: {fontSize: '0.75em', lineHeight: 1.4, fontWeight: 500},
      },
    });
    expect(paragraphs.map((el) => el.getAttribute('data-size'))).toEqual([
      null,
      'tiny',
      'huge',
    ]);
    expect(paragraphs[1].style.fontSize).toBe('0.75em');
    expect(paragraphs[1].style.lineHeight).toBe('1.4');
    expect(paragraphs[1].style.fontWeight).toBe('500');
    // Declared with no `editorStyle`, so it previews at the normal size.
    expect(paragraphs[2].style.fontSize).toBe('');
    expect(paragraphs[2].style.lineHeight).toBe('');
    expect(paragraphs[2].style.fontWeight).toBe('');
  });

  test('still marks the size when no editor style is declared', () => {
    const paragraphs = renderParagraphs();
    expect(paragraphs[1].getAttribute('data-size')).toBe('tiny');
    expect(paragraphs[1].style.fontSize).toBe('');
  });

  test('never puts the editor style on an unsized paragraph', () => {
    const paragraphs = renderParagraphs({
      paragraphSizeStyles: {tiny: {fontSize: '0.75em'}},
    });
    expect(paragraphs[0].hasAttribute('data-size')).toBe(false);
    expect(paragraphs[0].style.fontSize).toBe('');
  });
});

describe('mentions', () => {
  const MENTIONS: RichTextData = {
    version: '1',
    time: 0,
    blocks: [
      {
        type: 'paragraph',
        data: {
          text: `cc ${createRichTextMentionHtml('me@example.com', 'Me')} please`,
        },
      },
      {
        type: 'unorderedList',
        data: {
          style: 'unordered',
          items: [{content: createRichTextMentionHtml('you@example.com')}],
        },
      },
    ],
  };

  test('loads mention links as mention nodes', () => {
    const editor = createTestEditor();
    editor.update(() => convertToLexical(MENTIONS), {discrete: true});
    editor.read(() => {
      const paragraph = $getRoot().getFirstChild();
      const children = (paragraph as any).getChildren();
      expect(children).toHaveLength(3);
      expect($isMentionNode(children[1])).toBe(true);
      expect(children[1].getEmail()).toBe('me@example.com');
      expect(children[1].getTextContent()).toBe('@Me');
    });
  });

  test('round-trips mentions through rich text data', () => {
    expect(roundTrip(MENTIONS)?.blocks).toEqual(MENTIONS.blocks);
  });

  test('keeps plain mailto links as links', () => {
    const data: RichTextData = {
      version: '1',
      time: 0,
      blocks: [
        {
          type: 'paragraph',
          data: {text: '<a href="mailto:me@example.com">email me</a>'},
        },
      ],
    };
    expect(roundTrip(data)?.blocks).toEqual(data.blocks);
  });
});
