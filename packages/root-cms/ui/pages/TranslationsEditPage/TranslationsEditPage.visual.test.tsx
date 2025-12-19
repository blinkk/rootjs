import '../../styles/global.css';
import '../../styles/theme.css';

import {MantineProvider} from '@mantine/core';
import {render} from '@testing-library/preact';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {page, userEvent} from 'vitest/browser';
import * as l10n from '../../utils/l10n.js';
import {TranslationsEditPage} from './TranslationsEditPage.js';

// Mock l10n.
vi.mock('../../utils/l10n.js', () => ({
  getTranslationByHash: vi.fn(),
  updateTranslationByHash: vi.fn(),
  normalizeString: (str: string) => str,
}));

// Mock notifications.
vi.mock('../../utils/notifications.js', () => ({
  showNotification: vi.fn(),
}));

// Mock window.__ROOT_CTX.
window.__ROOT_CTX = {
  rootConfig: {
    i18n: {
      locales: ['en', 'es', 'fr', 'de'],
    },
  },
} as any;

// Mock window.firebase.
window.firebase = {
  user: {
    email: 'test@example.com',
  },
} as any;

describe('TranslationsEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('edits tags and saves translations', async () => {
    page.viewport(1200, 800);
    const hash = 'test-hash';
    const mockTranslation = {
      source: 'Test Source',
      en: 'Test EN',
      es: 'Test ES',
      tags: ['initial-tag'],
    };

    vi.mocked(l10n.getTranslationByHash).mockResolvedValue(mockTranslation);

    render(
      <MantineProvider>
        <div data-testid="translations-edit-page">
          <TranslationsEditPage hash={hash} />
        </div>
      </MantineProvider>
    );

    const element = page.getByTestId('translations-edit-page');

    // Wait for load.
    await expect
      .element(element.locator('textarea[name="source"]'))
      .toHaveValue('Test Source');

    // 1. Edit Tags.
    const multiSelect = element.locator(
      '.TranslationsEditPage__TagsForm [class*="MultiSelect-input"]'
    );
    await multiSelect.click();

    const tagInput = element.locator(
      '.TranslationsEditPage__TagsForm input[type="search"]'
    );
    await tagInput.fill('new-tag');
    await userEvent.keyboard('{Enter}');

    // Click "Save tags".
    const saveTagsButton = element.getByRole('button', {name: 'Save tags'});
    await saveTagsButton.click();

    // Verify updateTranslationByHash called with new tags.
    expect(l10n.updateTranslationByHash).toHaveBeenCalledWith(hash, {
      ...mockTranslation,
      tags: ['initial-tag', 'new-tag'],
    });

    // 2. Edit Translations.
    const enInput = element.locator('textarea[name="en"]');
    await enInput.fill('Test EN Updated');

    // Click "Save".
    const saveButton = element.getByRole('button', {name: 'Save', exact: true});
    await saveButton.click();

    // Verify updateTranslationByHash called with new translation.
    expect(l10n.updateTranslationByHash).toHaveBeenCalledWith(
      hash,
      expect.objectContaining({
        en: 'Test EN Updated',
      })
    );
  });
});
