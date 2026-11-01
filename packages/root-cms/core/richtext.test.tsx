import {render, cleanup} from '@testing-library/preact';
import {createContext} from 'preact';
import {useContext} from 'preact/hooks';
import {afterEach, expect, test} from 'vitest';
import {RichText, RichTextContext, RichTextData} from './richtext.js';

afterEach(() => {
  cleanup();
});

/**
 * Regression test: inline components rendered via `renderToString` previously
 * lost the surrounding Preact context (so e.g. `useTranslations()` couldn't
 * find the `I18nContext`). The fix captures the parent's full context tree
 * via a class component and threads it through `renderToString`, so any
 * `useContext()` call inside an inline component sees the providers above
 * `<RichText>`.
 */
test('inline component sees context providers from the parent render tree', () => {
  const NameContext = createContext<string>('default');

  function NameInline() {
    const name = useContext(NameContext);
    return <span data-testid="name">{name}</span>;
  }

  const data: RichTextData = {
    blocks: [
      {
        type: 'paragraph',
        data: {
          text: 'Hello, {NameInline:abc}!',
          components: {
            abc: {type: 'NameInline', data: {}},
          },
        },
      },
    ],
  };

  const {container} = render(
    <NameContext.Provider value="Alice">
      <RichText data={data} components={{NameInline}} />
    </NameContext.Provider>
  );

  // Marker was substituted, the inline span was rendered with the provider's
  // value (not the context default).
  expect(container.innerHTML).not.toContain('{NameInline:abc}');
  expect(container.innerHTML).not.toContain('default');
  expect(container.innerHTML).toContain('Alice');
  expect(container.innerHTML).toContain('Hello,');
});

test('paragraph size renders as a data-size attribute', () => {
  const data: RichTextData = {
    blocks: [
      {type: 'paragraph', data: {text: 'Normal.'}},
      {type: 'paragraph', data: {size: 'small', text: 'Small.'}},
      // Sizes are site-defined, so any value is passed through as-is.
      {type: 'paragraph', data: {size: 'body-3', text: 'Custom.'}},
      {type: 'paragraph', data: {size: 42, text: 'Not a size.'}},
    ],
  };

  const {container} = render(<RichText data={data} />);

  const paragraphs = Array.from(container.querySelectorAll('p'));
  expect(paragraphs.map((el) => el.getAttribute('data-size'))).toEqual([
    null,
    'small',
    'body-3',
    null,
  ]);
});

/**
 * Stored docs aren't guaranteed to be valid, and a throw here fails the whole
 * page render rather than one block.
 */
test('renders malformed blocks without throwing', () => {
  const blocks = [
    {type: 'heading', data: {level: {a: 1}, text: 'Fallback level'}},
    {type: 'heading', data: {level: 'bad level', text: 'Fallback level'}},
    {type: 'paragraph', data: {text: {a: 1}}},
    {type: 'paragraph', data: {text: ['a']}},
    {type: 'paragraph', data: {text: 'x', components: {a: null}}},
    {type: 'unorderedList', data: {items: 'abc'}},
    {type: 'unorderedList', data: {items: [null, 'a']}},
    {type: 'table', data: {rows: [{}, null, {cells: [null]}]}},
    {type: 'table', data: {rows: 'abc'}},
    {type: 'html', data: {html: {a: 1}}},
    {type: 'paragraph', data: {text: 'Still rendered'}},
  ];
  const {container} = render(
    <RichTextContext.Provider value={{t: (text) => text}}>
      <RichText data={{blocks} as RichTextData} />
    </RichTextContext.Provider>
  );
  expect(container.textContent).toContain('Still rendered');
  expect(container.querySelectorAll('h2')).toHaveLength(2);
  // A value that isn't a list of blocks is ignored.
  render(<RichText data={{blocks: {_array: []}} as unknown as RichTextData} />);
});
