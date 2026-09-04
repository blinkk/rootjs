import '../../styles/global.css';
import '../../styles/theme.css';

import {MantineProvider} from '@mantine/core';
import {cleanup, render, screen, waitFor} from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {page} from 'vitest/browser';
import {
  extractRichTextMentions,
  RichTextData,
} from '../../../shared/richtext.js';
import {CommentEditor} from './CommentEditor.js';

vi.mock('../../hooks/useProjectUsers.js', () => ({
  useProjectUsers: () => ({
    loading: false,
    users: [
      {email: 'alex@example.com', displayName: 'Alex Example'},
      {email: 'blake@example.com', displayName: 'Blake Example'},
      {email: 'casey@example.com'},
    ],
  }),
}));

vi.mock('../../hooks/useUserProfile.js', () => ({
  useUserProfile: () => ({profile: null, loading: false}),
  useUserProfiles: () => ({profiles: new Map(), loading: false}),
  useAllUserProfiles: () => ({profiles: [], loading: false}),
}));

// Globals are restored after the run so other test files aren't affected.
const originalRootCtx = window.__ROOT_CTX;

beforeAll(() => {
  window.__ROOT_CTX = {
    experiments: {},
    rootConfig: {projectId: 'test-project'},
  } as any;
});

afterAll(() => {
  window.__ROOT_CTX = originalRootCtx;
});

afterEach(() => {
  cleanup();
});

describe('CommentEditor', () => {
  it('hides the toolbar in the minimal variant', () => {
    render(
      <MantineProvider>
        <CommentEditor variant="minimal" placeholder="Comment…" />
      </MantineProvider>
    );
    expect(document.querySelector('.LexicalEditor__toolbar')).toBeNull();
    expect(document.querySelector('.LexicalEditor--noToolbar')).not.toBeNull();
  });

  it('shows the toolbar in the default variant', () => {
    render(
      <MantineProvider>
        <CommentEditor placeholder="Comment…" />
      </MantineProvider>
    );
    expect(document.querySelector('.LexicalEditor__toolbar')).not.toBeNull();
  });

  it('autocompletes @mentions of project users', async () => {
    page.viewport(800, 600);
    const user = userEvent.setup();
    let value: RichTextData | null = null;
    render(
      <MantineProvider>
        <div style={{padding: '20px'}}>
          <CommentEditor
            variant="minimal"
            placeholder="Comment…"
            onChange={(next) => {
              value = next;
            }}
          />
        </div>
      </MantineProvider>
    );

    const editor = document.querySelector<HTMLElement>(
      '.LexicalEditor__editor'
    )!;
    await user.click(editor);
    await user.keyboard('cc @ale');

    const listbox = await screen.findByRole('listbox', {
      name: 'User mention suggestions',
    });
    const options = listbox.querySelectorAll('[role="option"]');
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain('Alex Example');

    await user.keyboard('{Enter}');

    await waitFor(() => {
      const mention = editor.querySelector<HTMLElement>('.MentionNode');
      expect(mention).not.toBeNull();
      expect(mention!.getAttribute('data-mention')).toBe('alex@example.com');
      expect(mention!.textContent).toBe('@Alex Example');
    });
    expect(
      screen.queryByRole('listbox', {name: 'User mention suggestions'})
    ).toBeNull();

    await user.keyboard('please review');
    await waitFor(() => {
      expect(extractRichTextMentions(value)).toEqual(['alex@example.com']);
    });
    const text = (value!.blocks[0] as any).data.text as string;
    expect(text).toContain(
      '<a href="mailto:alex@example.com" data-mention="alex@example.com">@Alex Example</a>'
    );
    expect(text).toContain('please review');
  });

  it('does not open the menu for emails typed inline', async () => {
    const user = userEvent.setup();
    render(
      <MantineProvider>
        <CommentEditor variant="minimal" placeholder="Comment…" />
      </MantineProvider>
    );
    const editor = document.querySelector<HTMLElement>(
      '.LexicalEditor__editor'
    )!;
    await user.click(editor);
    await user.keyboard('mail me@example.com');
    expect(
      screen.queryByRole('listbox', {name: 'User mention suggestions'})
    ).toBeNull();
  });
});
