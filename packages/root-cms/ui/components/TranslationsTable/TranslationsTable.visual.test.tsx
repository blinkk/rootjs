import '../../styles/global.css';
import '../../styles/theme.css';

import {MantineProvider} from '@mantine/core';
import {render} from '@testing-library/preact';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {page} from 'vitest/browser';
import * as l10n from '../../utils/l10n.js';
import {TranslationsTable} from './TranslationsTable.js';

// Mock l10n.
vi.mock('../../utils/l10n.js', () => ({
  loadTranslations: vi.fn(),
}));

// Mock notifications.
vi.mock('../../utils/notifications.js', () => ({
  notifyErrors: vi.fn((fn) => fn()),
}));

// Mock window.__ROOT_CTX.
window.__ROOT_CTX = {
  rootConfig: {
    i18n: {
      locales: ['en', 'es', 'fr', 'de'],
    },
  },
} as any;

function generateMockTranslations(count: number) {
  const translations: Record<string, any> = {};
  const tagOptions = [
    ['Pages/test'],
    ['Pages/foobar'],
    ['LocalizerRequests'],
    ['LocalizerRequests/foobar'],
  ];

  const lorem =
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum id ligula porta felis euismod semper.';

  for (let i = 0; i < count; i++) {
    const hash = `hash-${i}`;
    translations[hash] = {
      source: `${lorem} (${i})`,
      en: `English: ${lorem} (${i})`,
      es: `Spanish: ${lorem} (${i})`,
      fr: `French: ${lorem} (${i})`,
      de: `German: ${lorem} (${i})`,
      tags: tagOptions[i % tagOptions.length],
    };
  }
  return translations;
}

describe('TranslationsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset URL params.
    window.history.pushState({}, '', '/');
  });

  it('renders table with many translations', async () => {
    page.viewport(2400, 1600);
    const mockData = generateMockTranslations(50);
    vi.mocked(l10n.loadTranslations).mockResolvedValue(mockData);

    render(
      <MantineProvider>
        <div data-testid="translations-table">
          <TranslationsTable />
        </div>
      </MantineProvider>
    );

    const element = page.getByTestId('translations-table');

    // Verify header is present.
    await expect.element(element.getByText('Source')).toBeVisible();

    // Verify data loading.
    expect(l10n.loadTranslations).toHaveBeenCalled();

    await expect
      .element(
        element.getByText('Lorem ipsum dolor sit amet', {exact: false}).first()
      )
      .toBeVisible();
    await expect
      .element(element)
      .toMatchScreenshot('TranslationsTable-many-rows.png');
  });

  it('filters by search and tags', async () => {
    page.viewport(1200, 800);
    const mockData = generateMockTranslations(10);
    mockData['search-hash'] = {
      source: 'UniqueSearchTerm',
      en: 'UniqueSearchTerm EN',
      tags: ['special-tag'],
    };
    vi.mocked(l10n.loadTranslations).mockResolvedValue(mockData);

    render(
      <MantineProvider>
        <div data-testid="translations-table-functional">
          <TranslationsTable />
        </div>
      </MantineProvider>
    );

    const element = page.getByTestId('translations-table-functional');

    // Wait for load.
    await expect
      .element(element.getByText('UniqueSearchTerm').first())
      .toBeVisible();

    // Test search.
    const searchInput = element.getByPlaceholder('Search translations');
    await searchInput.fill('UniqueSearchTerm');

    // Verify filtering - filtered rows are removed from DOM.
    await expect
      .element(element.getByText('Lorem ipsum dolor sit amet', {exact: false}))
      .not.toBeInTheDocument();
    await expect
      .element(element.getByText('UniqueSearchTerm').first())
      .toBeVisible();

    // Clear search.
    await searchInput.fill('');
    await expect
      .element(
        element.getByText('Lorem ipsum dolor sit amet', {exact: false}).first()
      )
      .toBeVisible();

    // Test tag filter.
    const tagInput = element.getByPlaceholder('All tags');
    await tagInput.click();
    await page.getByRole('option', {name: 'special-tag'}).click();

    // Verify filtering - filtered rows are removed from DOM.
    await expect
      .element(element.getByText('UniqueSearchTerm').first())
      .toBeVisible();
    await expect
      .element(element.getByText('Lorem ipsum dolor sit amet', {exact: false}))
      .not.toBeInTheDocument();
  });

  it('filters by locale', async () => {
    page.viewport(1200, 800);
    const mockData = generateMockTranslations(5);
    vi.mocked(l10n.loadTranslations).mockResolvedValue(mockData);

    render(
      <MantineProvider>
        <div data-testid="translations-table-locale">
          <TranslationsTable />
        </div>
      </MantineProvider>
    );

    const element = page.getByTestId('translations-table-locale');

    await expect
      .element(
        element.getByText('Lorem ipsum dolor sit amet', {exact: false}).first()
      )
      .toBeVisible();

    // Default: all locales visible (en, es, fr, de).
    await expect.element(element.getByText('fr').first()).toBeVisible();

    // Filter locales.
    const localeInput = element.getByPlaceholder('All locales');
    await localeInput.click();
    await page.getByRole('option', {name: 'es'}).click();

    // 'fr' column header should be gone.
    await expect
      .element(element.getByText('fr').first())
      .not.toBeInTheDocument();
    // 'es' column header should be visible.
    await expect.element(element.getByText('es').first()).toBeVisible();
  });
});
