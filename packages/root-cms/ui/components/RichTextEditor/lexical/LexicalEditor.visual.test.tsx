import './LexicalEditor.css';
import '../../../styles/global.css';
import '../../../styles/theme.css';

import {MantineProvider} from '@mantine/core';
import {render, screen} from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import {describe, it, vi, expect} from 'vitest';
import {page} from 'vitest/browser';
import {RichTextData} from '../../../../shared/richtext.js';
import {DeeplinkProvider} from '../../../hooks/useDeeplink.js';
import {LexicalEditor} from './LexicalEditor.js';

vi.mock('../../../hooks/useDeeplink.js', async () => {
  const actual = await vi.importActual<any>('../../../hooks/useDeeplink.js');
  return {
    ...actual,
    useDeeplink: () => ({
      value: '',
      setValue: vi.fn(),
    }),
  };
});

vi.mock('../../EditTranslationsModal/EditTranslationsModal.js', () => ({
  useEditTranslationsModal: () => ({
    open: vi.fn(),
  }),
}));

// Mock URL.createObjectURL to return a data URI.
const CARROT_ICON_DATA_URI =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cGF0aCBkPSJNMTAwIDE4MCBMNDAgNDAgTDE2MCA0MCBaIiBmaWxsPSJvcmFuZ2UiIC8+CiAgPHJlY3QgeD0iOTAiIHk9IjEwIiB3aWR0aD0iMjAiIGhlaWdodD0iMzAiIGZpbGw9ImdyZWVuIiAvPgo8L3N2Zz4=';

window.URL.createObjectURL = vi.fn(() => CARROT_ICON_DATA_URI);
window.URL.revokeObjectURL = vi.fn();

// Mock the context.
window.__ROOT_CTX = {
  experiments: {},
  rootConfig: {
    projectId: 'test-project',
  },
} as any;

const RICH_TEXT_DATA: RichTextData = {
  version: '1',
  time: 1234567890,
  blocks: [
    {
      type: 'heading',
      data: {
        level: 1,
        text: 'Hello World',
      },
    },
    {
      type: 'paragraph',
      data: {
        text: 'This is a paragraph with <b>bold</b> and <i>italic</i> text.',
      },
    },
    {
      type: 'unorderedList',
      data: {
        style: 'unordered',
        items: [{content: 'Unordered Item 1'}, {content: 'Unordered Item 2'}],
      },
    },
    {
      type: 'orderedList',
      data: {
        style: 'ordered',
        items: [{content: 'Ordered Item 1'}, {content: 'Ordered Item 2'}],
      },
    },
    {
      type: 'quote',
      data: {
        text: 'This is a quote block.',
      },
    },
    {
      type: 'image',
      data: {
        file: {
          src: CARROT_ICON_DATA_URI,
          width: 200,
          height: 200,
          alt: 'Example Image',
        },
      },
    },
    {
      type: 'table',
      data: {
        rows: [
          {
            cells: [
              {
                type: 'header',
                blocks: [{type: 'paragraph', data: {text: 'Header 1'}}],
              },
              {
                type: 'header',
                blocks: [{type: 'paragraph', data: {text: 'Header 2'}}],
              },
            ],
          },
          {
            cells: [
              {
                type: 'data',
                blocks: [{type: 'paragraph', data: {text: 'Cell 1'}}],
              },
              {
                type: 'data',
                blocks: [{type: 'paragraph', data: {text: 'Cell 2'}}],
              },
            ],
          },
        ],
      },
    },
  ],
};

describe('LexicalEditor', () => {
  it('renders with various blocks', async () => {
    page.viewport(800, 1000);
    render(
      <MantineProvider>
        <div style={{minHeight: '500px', padding: '20px'}}>
          <LexicalEditor value={RICH_TEXT_DATA} autosize />
        </div>
      </MantineProvider>
    );
    await expect
      .element(document.body)
      .toMatchScreenshot('lexical-editor-blocks.png');
  });

  it('renders html block', async () => {
    page.viewport(800, 1000);
    const user = userEvent.setup();
    render(
      <MantineProvider>
        <DeeplinkProvider>
          <div style={{minHeight: '500px', padding: '20px'}}>
            <LexicalEditor />
          </div>
        </DeeplinkProvider>
      </MantineProvider>
    );

    await user.click(screen.getAllByRole('button', {name: 'Components'})[0]);
    await user.click(screen.getByRole('menuitem', {name: 'HTML Code'}));

    const textarea = screen.getAllByRole('textbox')[0];
    await user.click(textarea);

    // Use paste because `user.type` is slow for tons of content.
    await user.paste(
      Array.from(
        {length: 20},
        () =>
          '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>'
      ).join('\n')
    );

    await expect
      .element(document.body)
      .toMatchScreenshot('lexical-editor-html-block-modal.png');

    await user.click(screen.getByRole('button', {name: 'Insert block'}));

    await expect
      .element(document.body)
      .toMatchScreenshot('lexical-editor-html-block-inserted.png');
  });
});
