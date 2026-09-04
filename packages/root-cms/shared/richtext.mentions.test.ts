import {describe, expect, it} from 'vitest';
import {
  createRichTextMentionHtml,
  extractRichTextMentions,
  getRichTextPlainText,
  RichTextData,
} from './richtext.js';

describe('createRichTextMentionHtml', () => {
  it('renders a mailto link flagged as a mention', () => {
    expect(createRichTextMentionHtml('Me@Example.com', 'Me')).toBe(
      '<a href="mailto:me@example.com" data-mention="me@example.com">@Me</a>'
    );
  });

  it('falls back to the email as the label and escapes html', () => {
    expect(createRichTextMentionHtml('a@b.com')).toBe(
      '<a href="mailto:a@b.com" data-mention="a@b.com">@a@b.com</a>'
    );
    expect(createRichTextMentionHtml('a@b.com', '<x>')).toContain('@&lt;x&gt;');
  });
});

describe('extractRichTextMentions', () => {
  it('finds unique mentions across blocks, lists and tables', () => {
    const data: RichTextData = {
      version: '1',
      time: 0,
      blocks: [
        {
          type: 'paragraph',
          data: {
            text: `hi ${createRichTextMentionHtml('a@x.com', 'A')} and ${createRichTextMentionHtml('B@x.com')}`,
          },
        },
        {
          type: 'unorderedList',
          data: {
            items: [
              {content: createRichTextMentionHtml('c@x.com')},
              {items: [{content: createRichTextMentionHtml('a@x.com')}]},
            ],
          },
        },
        {
          type: 'table',
          data: {
            rows: [
              {
                cells: [
                  {
                    type: 'data',
                    blocks: [
                      {
                        type: 'paragraph',
                        data: {text: createRichTextMentionHtml('d@x.com')},
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    };
    expect(extractRichTextMentions(data)).toEqual([
      'a@x.com',
      'b@x.com',
      'c@x.com',
      'd@x.com',
    ]);
  });

  it('ignores plain mailto links and empty data', () => {
    expect(
      extractRichTextMentions({
        version: '1',
        time: 0,
        blocks: [
          {type: 'paragraph', data: {text: '<a href="mailto:a@x.com">a</a>'}},
        ],
      })
    ).toEqual([]);
    expect(extractRichTextMentions(null)).toEqual([]);
  });
});

describe('getRichTextPlainText', () => {
  it('strips html and joins blocks with newlines', () => {
    const data: RichTextData = {
      version: '1',
      time: 0,
      blocks: [
        {type: 'paragraph', data: {text: 'Hello <b>world</b>&amp;<br>next'}},
        {type: 'heading', data: {text: 'Title', level: 2}},
        {
          type: 'orderedList',
          data: {items: [{content: 'one'}, {content: 'two'}]},
        },
      ],
    };
    expect(getRichTextPlainText(data)).toBe(
      'Hello world&\nnext\nTitle\none\ntwo'
    );
    expect(getRichTextPlainText(null)).toBe('');
  });
});
