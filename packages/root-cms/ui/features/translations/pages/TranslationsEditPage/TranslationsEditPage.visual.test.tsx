import '../../../../styles/tailwind.out.css';
import '../../../../styles/global.css';
import '../../../../styles/theme.css';

import {render} from '@testing-library/preact';
import type {ComponentChildren} from 'preact';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {page, userEvent} from 'vitest/browser';
import * as l10n from '../../l10n.js';
import {TranslationsEditPage} from './TranslationsEditPage.js';

// Mock l10n's Firestore calls, keeping its pure helpers.
vi.mock('../../l10n.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../l10n.js')>()),
  getTranslationByHash: vi.fn(),
  updateTranslationByHash: vi.fn(),
  normalizeString: (str: string) => str,
}));

// Render the page without the app shell, which needs a router and a user.
vi.mock('../../../../app/layout/Layout.js', () => ({
  Layout: (props: {children?: ComponentChildren}) => <>{props.children}</>,
}));

// Mock notifications.
vi.mock('../../../../utils/notifications.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../utils/notifications.js')
  >()),
  notifyErrors: vi.fn((fn) => fn()),
}));
vi.mock(
  '../../../../primitives/Toast/toastStore.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../primitives/Toast/toastStore.js')
    >()),
    showNotification: vi.fn(),
  })
);

// Mock window.__ROOT_CTX.
window.__ROOT_CTX = {
  rootConfig: {
    i18n: {
      locales: ['en', 'es', 'fr', 'de'],
    },
  },
  collections: {},
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
      <div data-testid="translations-edit-page">
        <TranslationsEditPage hash={hash} />
      </div>
    );

    const element = page.getByTestId('translations-edit-page');

    // Wait for load.
    await expect
      .element(element.getByRole('textbox', {name: 'source', exact: true}))
      .toHaveValue('Test Source');

    // 1. Edit Tags.
    const tagInput = element.getByRole('combobox', {name: 'Tags'});
    await tagInput.click();
    await tagInput.fill('new-tag');
    await userEvent.keyboard('{Enter}');

    // Wait for the tag to be added.
    await expect
      .element(element.getByText('new-tag', {exact: true}))
      .toBeVisible();

    // Click "Save tags".
    const saveTagsButton = element.getByRole('button', {name: 'Save tags'});
    await saveTagsButton.click();

    // Verify updateTranslationByHash called with new tags.
    expect(l10n.updateTranslationByHash).toHaveBeenCalledWith(hash, {
      ...mockTranslation,
      tags: ['initial-tag', 'new-tag'],
    });

    // 2. Edit Translations.
    const enInput = element.getByRole('textbox', {name: 'en', exact: true});
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

    await expect(element).toMatchScreenshot();
  });
});
