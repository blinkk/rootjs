import {describe, expect, test} from 'vitest';
import {
  getRichTextParagraphEditorStyles,
  normalizeRichTextParagraphSizes,
  RichTextData,
  testSameRichTextContent,
} from './richtext.js';

describe('normalizeRichTextParagraphSizes', () => {
  test('defaults labels to the size value', () => {
    expect(normalizeRichTextParagraphSizes(['small', 'large'])).toEqual([
      {value: 'small', label: 'small'},
      {value: 'large', label: 'large'},
    ]);
  });

  test('carries the editor style and drops unusable values', () => {
    expect(
      normalizeRichTextParagraphSizes([
        {
          value: 'tiny',
          label: 'Tiny',
          editorStyle: {
            fontSize: '  0.75em ',
            lineHeight: 1.4,
            fontWeight: 500,
          },
        },
        {value: 'huge', editorStyle: {fontSize: '   '}},
        {value: 'plain', editorStyle: {}},
      ])
    ).toEqual([
      {
        value: 'tiny',
        label: 'Tiny',
        editorStyle: {fontSize: '0.75em', lineHeight: 1.4, fontWeight: 500},
      },
      {value: 'huge', label: 'huge'},
      {value: 'plain', label: 'plain'},
    ]);
  });

  test('ignores editor style properties outside the supported set', () => {
    const [option] = normalizeRichTextParagraphSizes([
      {
        value: 'tiny',
        editorStyle: {fontSize: '0.75em', color: 'red', display: 'none'} as any,
      },
    ]);
    expect(option.editorStyle).toEqual({fontSize: '0.75em'});
  });

  test('preserves explicit labels and declaration order', () => {
    expect(
      normalizeRichTextParagraphSizes([
        {value: 'large', label: 'Larger'},
        'small',
      ])
    ).toEqual([
      {value: 'large', label: 'Larger'},
      {value: 'small', label: 'small'},
    ]);
  });

  test('drops entries without a usable value', () => {
    expect(
      normalizeRichTextParagraphSizes([
        'small',
        '',
        {value: '  '},
        {label: 'No value'} as any,
      ])
    ).toEqual([{value: 'small', label: 'small'}]);
  });
});

describe('getRichTextParagraphEditorStyles', () => {
  test('maps only the sizes that declared an editor style', () => {
    expect(
      getRichTextParagraphEditorStyles([
        {
          value: 'tiny',
          label: 'Tiny',
          editorStyle: {fontSize: '0.75em', fontWeight: 300},
        },
        {value: 'huge', label: 'Huge'},
        'small',
      ])
    ).toEqual({tiny: {fontSize: '0.75em', fontWeight: 300}});
  });
});

describe('testSameRichTextContent', () => {
  function richText(text: string, time: number): RichTextData {
    return {time, version: '1', blocks: [{type: 'paragraph', data: {text}}]};
  }

  test('ignores the timestamp and version', () => {
    expect(
      testSameRichTextContent(richText('hello', 1), richText('hello', 2))
    ).toBe(true);
    expect(
      testSameRichTextContent(
        {time: 1, version: 'editorjs', blocks: []},
        {time: 2, version: 'lexical-0.31.2', blocks: []}
      )
    ).toBe(true);
  });

  test('compares block content', () => {
    expect(
      testSameRichTextContent(richText('hello', 1), richText('world', 1))
    ).toBe(false);
    expect(
      testSameRichTextContent(richText('hello', 1), {
        time: 1,
        version: '1',
        blocks: [
          {type: 'paragraph', data: {text: 'hello'}},
          {type: 'paragraph', data: {text: 'world'}},
        ],
      })
    ).toBe(false);
    expect(
      testSameRichTextContent(
        {
          time: 1,
          version: '1',
          blocks: [{type: 'heading', data: {level: 2, text: 'hello'}}],
        },
        {
          time: 1,
          version: '1',
          blocks: [{type: 'heading', data: {text: 'hello', level: 2}}],
        }
      )
    ).toBe(true);
  });

  test('treats empty values as equal', () => {
    expect(testSameRichTextContent(null, undefined)).toBe(true);
    expect(
      testSameRichTextContent(null, {time: 1, version: '1', blocks: []})
    ).toBe(true);
    expect(testSameRichTextContent(null, richText('hello', 1))).toBe(false);
  });

  test('compares keys that one side swapped for another', () => {
    // Same key count, different keys: a block that dropped `components` and
    // gained `size` is not the same content.
    expect(
      testSameRichTextContent(
        {
          time: 1,
          version: '1',
          blocks: [
            {type: 'paragraph', data: {text: 'hello', components: undefined}},
          ],
        },
        {
          time: 1,
          version: '1',
          blocks: [{type: 'paragraph', data: {text: 'hello', size: 'large'}}],
        }
      )
    ).toBe(false);
  });

  test('treats missing and empty keys as equal', () => {
    // Values that round-trip through firestore lose their `undefined` keys.
    expect(
      testSameRichTextContent(
        {
          time: 1,
          version: '1',
          blocks: [{type: 'paragraph', data: {text: 'hello', size: undefined}}],
        },
        {
          time: 1,
          version: '1',
          blocks: [{type: 'paragraph', data: {text: 'hello'}}],
        }
      )
    ).toBe(true);
    expect(
      testSameRichTextContent(
        {
          time: 1,
          version: '1',
          blocks: [{type: 'paragraph', data: {text: 'hello', size: 'large'}}],
        },
        {
          time: 1,
          version: '1',
          blocks: [{type: 'paragraph', data: {text: 'hello'}}],
        }
      )
    ).toBe(false);
  });
});
