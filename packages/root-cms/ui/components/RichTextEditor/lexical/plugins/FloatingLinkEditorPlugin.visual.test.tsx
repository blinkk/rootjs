import '../../../../styles/global.css';
import '../../../../styles/theme.css';

import {MantineProvider} from '@mantine/core';
import {cleanup, render} from '@testing-library/preact';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {page, userEvent} from 'vitest/browser';
import {RichTextData} from '../../../../shared/richtext.js';
import {LexicalEditor} from '../LexicalEditor.js';

// Mock the context.
window.__ROOT_CTX = {
  experiments: {},
  rootConfig: {
    projectId: 'test-project',
  },
} as any;

const LINK_VALUE: RichTextData = {
  time: 1000,
  version: '1',
  blocks: [
    {
      type: 'paragraph',
      data: {text: 'go to <a href="https://example.com">example</a> now'},
    },
  ],
};

afterEach(() => {
  cleanup();
});

/** Renders the editor with a link and opens the floating link editor. */
async function renderLinkEditor() {
  page.viewport(800, 600);
  const {container} = render(
    <div style={{padding: '20px', width: '600px'}}>
      <MantineProvider>
        <LexicalEditor value={LINK_VALUE} onChange={() => {}} />
      </MantineProvider>
    </div>
  );
  const link = page.getByText('example');
  await expect.element(link).toBeVisible();
  // Clicking the link places the cursor inside it, which opens the floating
  // link editor.
  await userEvent.click(link);
  const checkbox = page.getByLabelText('Open in new tab');
  await expect.element(checkbox).toBeVisible();
  return {container, link, checkbox};
}

describe('FloatingLinkEditorPlugin', () => {
  it('keeps the "open in new tab" checkbox checked after clicking it', async () => {
    const {link, checkbox} = await renderLinkEditor();
    await expect.element(checkbox).not.toBeChecked();

    // Clicking the checkbox moves focus out of the url input, which used to
    // cause the resulting selection change to revert the pending value.
    await userEvent.click(checkbox);
    await expect.element(checkbox).toBeChecked();

    // The value survives subsequent selection changes within the same link.
    await userEvent.click(link);
    await expect.element(checkbox).toBeChecked();
  });

  it('saves the target to the link', async () => {
    const {container, checkbox} = await renderLinkEditor();
    await userEvent.click(checkbox);
    await userEvent.click(page.getByTitle('Save'));
    await vi.waitFor(() => {
      const anchor = container.querySelector('.LexicalEditor__editor a');
      expect(anchor?.getAttribute('target')).toBe('_blank');
    });
    await expect.element(checkbox).toBeChecked();
  });

  it('reverts pending changes with undo', async () => {
    const {checkbox} = await renderLinkEditor();
    await userEvent.click(checkbox);
    await expect.element(checkbox).toBeChecked();
    await userEvent.click(page.getByTitle('Undo'));
    await expect.element(checkbox).not.toBeChecked();
  });
});
