import '../LexicalEditor.css';
import '../../../../styles/global.css';
import '../../../../styles/theme.css';

import {MantineProvider} from '@mantine/core';
import {cleanup, render, screen} from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {DeeplinkProvider} from '../../../../hooks/useDeeplink.js';
import {LexicalEditor} from '../LexicalEditor.js';

vi.mock('../../../EditTranslationsModal/EditTranslationsModal.js', () => ({
  useEditTranslationsModal: () => ({
    open: vi.fn(),
  }),
}));

// Mock the context.
window.__ROOT_CTX = {
  experiments: {},
  rootConfig: {
    projectId: 'test-project',
  },
} as any;

afterEach(() => {
  cleanup();
});

/** Enough components that the dropdown offers its filter input. */
const FILTER_BLOCKS = [
  {name: 'heroBanner', label: 'Hero Banner', fields: []},
  {name: 'pullQuote', label: 'Pull Quote', fields: []},
  ...Array.from({length: 8}, (unused, i) => ({
    name: `filler${i}`,
    label: `Filler ${i}`,
    fields: [],
  })),
] as any;

const FILTER_INLINE = [
  {name: 'heroLink', label: 'Hero Link', fields: []},
] as any;

function renderFilterableEditor() {
  render(
    <MantineProvider>
      <DeeplinkProvider>
        <div style={{minHeight: '500px', padding: '20px'}}>
          <LexicalEditor
            blockComponents={FILTER_BLOCKS}
            inlineComponents={FILTER_INLINE}
          />
        </div>
      </DeeplinkProvider>
    </MantineProvider>
  );
  return userEvent.setup();
}

function componentsFilter() {
  return screen.queryByRole('textbox', {name: 'Search components'});
}

function menuItemLabels() {
  return screen
    .queryAllByRole('menuitem')
    .map((item) => item.textContent)
    .filter(Boolean);
}

describe('ToolbarPlugin components dropdown', () => {
  it('omits the filter when there are only a few components', async () => {
    const user = userEvent.setup();
    render(
      <MantineProvider>
        <DeeplinkProvider>
          <LexicalEditor />
        </DeeplinkProvider>
      </MantineProvider>
    );

    await user.click(screen.getAllByRole('button', {name: 'Components'})[0]);

    expect(componentsFilter()).toBeNull();
    expect(menuItemLabels()).toContain('HTML Code');
  });

  it('focuses the filter and narrows the list as you type', async () => {
    const user = renderFilterableEditor();
    await user.click(screen.getAllByRole('button', {name: 'Components'})[0]);

    expect(document.activeElement).toBe(componentsFilter());

    await user.keyboard('hero');

    // Matches across both the inline and the block sections.
    expect(menuItemLabels()).toEqual(['Hero Link', 'Hero Banner']);
  });

  it('matches the component name as well as its label', async () => {
    const user = renderFilterableEditor();
    await user.click(screen.getAllByRole('button', {name: 'Components'})[0]);

    await user.keyboard('pullquote');

    expect(menuItemLabels()).toEqual(['Pull Quote']);
  });

  it('shows an empty state when nothing matches', async () => {
    const user = renderFilterableEditor();
    await user.click(screen.getAllByRole('button', {name: 'Components'})[0]);

    await user.keyboard('nothingmatchesthis');

    expect(menuItemLabels()).toEqual([]);
    expect(screen.getByText('No components found.')).toBeTruthy();
  });

  it('inserts the first match on enter', async () => {
    const user = renderFilterableEditor();
    await user.click(screen.getAllByRole('button', {name: 'Components'})[0]);

    await user.keyboard('html code{Enter}');

    // The HTML block opens its editor modal.
    expect(screen.getByRole('button', {name: 'Insert block'})).toBeTruthy();
  });

  it('moves focus into the list on arrow down', async () => {
    const user = renderFilterableEditor();
    await user.click(screen.getAllByRole('button', {name: 'Components'})[0]);

    await user.keyboard('hero{ArrowDown}');

    expect(document.activeElement?.textContent).toBe('Hero Link');
  });

  it('clears the filter on escape, then closes the menu', async () => {
    const user = renderFilterableEditor();
    await user.click(screen.getAllByRole('button', {name: 'Components'})[0]);

    await user.keyboard('hero{Escape}');
    expect(componentsFilter()).toHaveProperty('value', '');
    expect(menuItemLabels()).toContain('Pull Quote');

    await user.keyboard('{Escape}');
    await vi.waitFor(() => expect(componentsFilter()).toBeNull());
  });

  it('resets the filter when the menu is reopened', async () => {
    const user = renderFilterableEditor();
    const control = screen.getAllByRole('button', {name: 'Components'})[0];

    await user.click(control);
    await user.keyboard('hero');
    await user.click(control);
    await vi.waitFor(() => expect(componentsFilter()).toBeNull());

    await user.click(control);
    expect(componentsFilter()).toHaveProperty('value', '');
    expect(menuItemLabels()).toContain('Pull Quote');
  });
});
