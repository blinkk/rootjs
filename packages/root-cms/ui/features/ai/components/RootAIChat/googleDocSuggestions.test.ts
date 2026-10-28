import {describe, expect, it} from 'vitest';
import {
  extractDocSuggestions,
  renderDocMarkdown,
  trimToChange,
} from './googleDocSuggestions.js';

/** Builds a Docs API text run element. */
function run(
  content: string,
  options?: {ins?: string[]; del?: string[]; fmt?: string[]; url?: string}
) {
  return {
    textRun: {
      content,
      ...(options?.ins ? {suggestedInsertionIds: options.ins} : {}),
      ...(options?.del ? {suggestedDeletionIds: options.del} : {}),
      ...(options?.fmt
        ? {
            suggestedTextStyleChanges: Object.fromEntries(
              options.fmt.map((id) => [id, {textStyle: {bold: true}}])
            ),
          }
        : {}),
      ...(options?.url ? {textStyle: {link: {url: options.url}}} : {}),
    },
  };
}

/** Builds a Docs API paragraph structural element. */
function paragraph(elements: any[], extra?: any) {
  return {paragraph: {elements, ...extra}};
}

function doc(content: any[], lists?: any) {
  return {tabs: [{documentTab: {body: {content}, lists}}]};
}

describe('renderDocMarkdown', () => {
  it('renders headings, lists, links and tables', () => {
    const markdown = renderDocMarkdown(
      doc(
        [
          paragraph([run('Launch plan\n')], {
            paragraphStyle: {namedStyleType: 'HEADING_2'},
          }),
          paragraph([
            run('See '),
            run('the brief', {url: 'https://x.dev'}),
            run('.\n'),
          ]),
          paragraph([run('First\n')], {bullet: {listId: 'ol'}}),
          paragraph([run('Nested\n')], {
            bullet: {listId: 'ul', nestingLevel: 1},
          }),
          {
            table: {
              tableRows: [
                {
                  tableCells: [
                    {content: [paragraph([run('Key\n')])]},
                    {content: [paragraph([run('Value\n')])]},
                  ],
                },
                {tableCells: [{content: [paragraph([run('a|b\n')])]}]},
              ],
            },
          },
        ],
        {
          ol: {listProperties: {nestingLevels: [{glyphType: 'DECIMAL'}]}},
          ul: {
            listProperties: {
              nestingLevels: [{glyphSymbol: '●'}, {glyphSymbol: '○'}],
            },
          },
        }
      )
    );
    expect(markdown).toBe(
      [
        '## Launch plan',
        '',
        'See [the brief](https://x.dev).',
        '',
        '1. First',
        '  - Nested',
        '',
        '| Key | Value |',
        '| --- | --- |',
        '| a\\|b |  |',
      ].join('\n')
    );
  });

  it('marks suggested edits inline, merging adjacent runs', () => {
    const markdown = renderDocMarkdown(
      doc([
        paragraph([
          run('Ship it '),
          run('next', {del: ['s1']}),
          run(' week', {del: ['s1']}),
          run('today', {ins: ['s1']}),
          run('.\n'),
        ]),
      ]),
      {inline: true}
    );
    expect(markdown).toBe('Ship it {--next week--}{++today++}.');
  });
});

describe('extractDocSuggestions', () => {
  it('describes each suggestion in context, ignoring the others', () => {
    const suggestions = extractDocSuggestions(
      doc([
        paragraph([run('Pricing\n')], {
          paragraphStyle: {namedStyleType: 'HEADING_1'},
        }),
        paragraph([
          run('It costs '),
          run('$10', {del: ['s1']}),
          run('$12', {ins: ['s1']}),
          run(' per month'),
          run(' (billed yearly)', {ins: ['s2']}),
          run('.\n'),
        ]),
        paragraph([run('Free', {fmt: ['s3']}), run(' trial.\n')]),
      ])
    );
    expect(suggestions).toEqual([
      {
        suggestionId: 's1',
        type: 'replacement',
        insertedText: '$12',
        deletedText: '$10',
        before: 'It costs $10 per month.',
        after: 'It costs $12 per month.',
        section: 'Pricing',
      },
      {
        suggestionId: 's2',
        type: 'insertion',
        insertedText: ' (billed yearly)',
        before: 'It costs $10 per month.',
        after: 'It costs $10 per month (billed yearly).',
        section: 'Pricing',
      },
      {
        suggestionId: 's3',
        type: 'formatting',
        formattedText: 'Free',
        before: 'Free trial.',
        after: 'Free trial.',
        section: 'Pricing',
      },
    ]);
  });
});

describe('trimToChange', () => {
  it('keeps the change plus a radius of context on each side', () => {
    const before = `${'a'.repeat(50)}OLD${'b'.repeat(50)}`;
    const after = `${'a'.repeat(50)}NEW${'b'.repeat(50)}`;
    expect(trimToChange(before, after, 5)).toEqual({
      before: '…aaaaaOLDbbbbb…',
      after: '…aaaaaNEWbbbbb…',
    });
  });
});
