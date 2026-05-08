import {render, cleanup} from '@testing-library/preact';
import {createContext} from 'preact';
import {useContext} from 'preact/hooks';
import {afterEach, expect, test} from 'vitest';
import {RichText, RichTextData} from './richtext.js';

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
