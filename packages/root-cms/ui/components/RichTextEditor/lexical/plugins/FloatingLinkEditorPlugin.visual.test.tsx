import './FloatingLinkEditorPlugin.css';
import '../../../../styles/global.css';
import '../../../../styles/theme.css';

import {MantineProvider} from '@mantine/core';
import {render, screen} from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import {describe, it, expect, vi} from 'vitest';
import {page} from 'vitest/browser';
import {RichTextData} from '../../../../../shared/richtext.js';
import {LexicalEditor} from '../LexicalEditor.js';

vi.mock('../../../../hooks/useDeeplink.js', async () => {
  const actual = await vi.importActual<any>('../../../../hooks/useDeeplink.js');
  return {
    ...actual,
    useDeeplink: () => ({
      value: '',
      setValue: vi.fn(),
    }),
  };
});

vi.mock('../../../EditTranslationsModal/EditTranslationsModal.js', () => ({
  useEditTranslationsModal: () => ({
    open: vi.fn(),
  }),
}));

window.URL.createObjectURL = vi.fn(() => '');
window.URL.revokeObjectURL = vi.fn();

window.__ROOT_CTX = {
  experiments: {},
  rootConfig: {
    projectId: 'test-project',
  },
} as any;

const LINK_RICH_TEXT_DATA: RichTextData = {
  version: '1',
  time: 1234567890,
  blocks: [
    {
      type: 'paragraph',
      data: {
        text: 'Here is a <a href="https://example.com">regular link</a> in a paragraph.',
      },
    },
    {
      type: 'paragraph',
      data: {
        text: 'And here is a <a href="https://google.com" target="_blank">new tab link</a> in another paragraph.',
      },
    },
  ],
};

describe('FloatingLinkEditorPlugin', () => {
  it('shows floating link editor when clicking a link', async () => {
    await page.viewport(600, 400);
    const user = userEvent.setup();

    render(
      <div style={{padding: '40px', width: '560px'}}>
        <MantineProvider>
          <LexicalEditor value={LINK_RICH_TEXT_DATA} autosize />
        </MantineProvider>
      </div>
    );

    // Click on the link text to trigger the floating link editor.
    const link = await screen.findByText('regular link');
    await user.click(link);

    // Wait for the floating link editor to become visible.
    await vi.waitFor(
      () => {
        const linkEditor = document.querySelector('.LexicalEditor__linkEditor');
        expect(linkEditor).not.toBeNull();
        expect((linkEditor as HTMLElement).style.opacity).toBe('1');
      },
      {timeout: 5000}
    );

    await expect
      .element(document.body)
      .toMatchScreenshot('floating-link-editor.png');
  });

  it('shows floating link editor with open in new tab checked', async () => {
    await page.viewport(600, 400);
    const user = userEvent.setup();

    render(
      <div style={{padding: '40px', width: '560px'}}>
        <MantineProvider>
          <LexicalEditor value={LINK_RICH_TEXT_DATA} autosize />
        </MantineProvider>
      </div>
    );

    // Click on the link that has target="_blank".
    const links = await screen.findAllByText('new tab link');
    const link = links[links.length - 1];
    await user.click(link);

    // Wait for the floating link editor to become visible.
    await vi.waitFor(
      () => {
        const linkEditor = document.querySelector('.LexicalEditor__linkEditor');
        expect(linkEditor).not.toBeNull();
        expect((linkEditor as HTMLElement).style.opacity).toBe('1');
      },
      {timeout: 5000}
    );

    await expect
      .element(document.body)
      .toMatchScreenshot('floating-link-editor-new-tab.png');
  });
});
