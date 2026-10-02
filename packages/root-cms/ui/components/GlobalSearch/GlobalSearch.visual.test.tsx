import '../../styles/global.css';
import '../../styles/mantine.css';
import '../../styles/theme.css';
import './GlobalSearch.css';

import {MantineProvider} from '@mantine/core';
import {cleanup, render} from '@testing-library/preact';
import {LocationProvider} from 'preact-iso';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {page, userEvent} from 'vitest/browser';
import type {DocSlugHit, GlobalSearchHit} from '../../hooks/useGlobalSearch.js';
import {GlobalSearch, openGlobalSearch} from './GlobalSearch.js';

const FIELD_HITS: GlobalSearchHit[] = [
  {
    id: 'Pages/spring-harvest#body',
    docId: 'Pages/spring-harvest',
    collection: 'Pages',
    slug: 'spring-harvest',
    deepKey: 'body',
    fieldLabel: 'Body',
    fieldType: 'richtext',
    text: 'Heirloom carrots, candy-striped beets and peppery radishes, pulled this morning by growers just down the road.',
    score: 2,
    terms: ['carrots'],
  },
  {
    id: 'Products/heirloom-carrots#description',
    docId: 'Products/heirloom-carrots',
    collection: 'Products',
    slug: 'heirloom-carrots',
    deepKey: 'description',
    fieldLabel: 'Description',
    fieldType: 'string',
    text: 'A rainbow bunch of Purple Haze, Nantes and Yellowstone carrots, sweetest after a frost.',
    score: 1,
    terms: ['carrots'],
  },
];

const DOC_HITS: DocSlugHit[] = [
  {
    collection: 'Recipes',
    slug: 'roasted-carrot-salad',
    docId: 'Recipes/roasted-carrot-salad',
  },
  {
    collection: 'GrowingGuides',
    slug: 'carrots',
    docId: 'GrowingGuides/carrots',
  },
];

vi.mock('../../hooks/useGlobalSearch.js', () => ({
  useGlobalSearch: (query: string) => ({
    hits: query.trim() ? FIELD_HITS : [],
    loading: false,
    error: null,
    status: {lastRun: Date.now() - 4 * 60_000},
  }),
  useDocSlugSearch: (query: string) => ({
    hits: query.trim() ? DOC_HITS : [],
    loading: false,
  }),
}));

vi.mock('../../hooks/usePendingReleases.js', () => ({
  usePendingReleases: () => ({releases: [], loading: false}),
}));

vi.mock('../../utils/data-source.js', () => ({
  listDataSources: () =>
    Promise.resolve([
      {
        id: 'carrot-varieties',
        description: 'Heirloom carrot varieties from the growers’ sheet',
      },
    ]),
}));

function renderSearch() {
  render(
    <MantineProvider>
      <LocationProvider>
        <GlobalSearch>
          <div style={{height: '100vh', background: '#fbfbf9'}} />
        </GlobalSearch>
      </LocationProvider>
    </MantineProvider>
  );
}

function spotlight() {
  return page.elementLocator(
    document.querySelector('.GlobalSearch__spotlight')!
  );
}

describe('GlobalSearch', () => {
  beforeEach(async () => {
    await page.viewport(960, 640);
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('renders results for a query', async () => {
    renderSearch();
    openGlobalSearch({query: 'carrot'});
    await expect.element(page.getByText('carrot-varieties')).toBeVisible();
    // Select the first result.
    await userEvent.keyboard('{ArrowDown}');
    await expect
      .poll(() => document.querySelector('.GlobalSearchAction--hovered'))
      .toBeTruthy();
    await expect.element(spotlight()).toMatchScreenshot('global-search.png');
  });

  it('renders recently viewed items for an empty query', async () => {
    window.localStorage.setItem(
      'root::cms:recentViews',
      JSON.stringify([
        {
          kind: 'doc',
          url: '/cms/content/Pages/spring-harvest',
          label: 'Pages/spring-harvest',
          viewedAt: 2,
        },
        {
          kind: 'collection',
          url: '/cms/content/Recipes',
          label: 'Recipes',
          description: 'Seasonal recipes',
          viewedAt: 1,
        },
      ])
    );
    renderSearch();
    openGlobalSearch();
    await expect.element(page.getByText('Recently viewed')).toBeVisible();
    await expect
      .element(spotlight())
      .toMatchScreenshot('global-search-recent.png');
  });
});
