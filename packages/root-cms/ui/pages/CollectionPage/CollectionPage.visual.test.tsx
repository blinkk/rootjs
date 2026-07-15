import '../../styles/global.css';
import '../../styles/theme.css';
import './CollectionPage.css';

import {MantineProvider} from '@mantine/core';
import {ModalsProvider} from '@mantine/modals';
import {render, cleanup} from '@testing-library/preact';
import {Timestamp} from 'firebase/firestore';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {page} from 'vitest/browser';
import {CMSDoc} from '../../utils/doc.js';
import {CollectionPage} from './CollectionPage.js';

vi.mock('../../hooks/usePendingReleases.js', () => ({
  usePendingReleases: () => ({
    pendingReleases: [],
    loading: false,
    getReleasesForDoc: () => [],
  }),
}));

vi.mock('../../hooks/useProjectRoles.js', () => ({
  useProjectRoles: () => ({
    roles: {'test@example.com': 'ADMIN'},
    loading: false,
  }),
}));

function mockTimestamp(millis: number): Timestamp {
  return {
    toMillis: () => millis,
    seconds: Math.floor(millis / 1000),
    nanoseconds: (millis % 1000) * 1000000,
    toDate: () => new Date(millis),
    isEqual: (other: Timestamp) => other.toMillis() === millis,
    toJSON: () => ({
      seconds: Math.floor(millis / 1000),
      nanoseconds: (millis % 1000) * 1000000,
    }),
    valueOf: () => millis.toString(),
  } as unknown as Timestamp;
}

function createDoc(slug: string, title: string, sortKey?: string): CMSDoc {
  return {
    id: `BlogPosts/${slug}`,
    collection: 'BlogPosts',
    slug,
    sys: {
      createdAt: mockTimestamp(1647485978000), // Mar 16, 2022.
      createdBy: 'test@example.com',
      modifiedAt: mockTimestamp(1647485978000),
      modifiedBy: 'test@example.com',
      sortKey,
    },
    fields: {
      meta: {title},
    },
  } as unknown as CMSDoc;
}

const MOCK_DOCS = [
  createDoc('first-post', 'The First Post', 'a0'),
  createDoc('second-post', 'The Second Post', 'a1'),
  createDoc('third-post', 'The Third Post', 'a2'),
];

beforeEach(async () => {
  await page.viewport(900, 480);

  (window as any).__ROOT_CTX = {
    collections: {
      BlogPosts: {
        name: 'Blog Posts',
        preview: {
          title: 'meta.title',
          image: 'meta.image',
        },
        customSorting: true,
      },
    },
    rootConfig: {
      projectId: 'test-project',
    },
  };
  (window as any).firebase = {
    user: {email: 'test@example.com'},
  };
});

afterEach(() => {
  cleanup();
});

describe('CollectionPage.DocsList custom sorting', () => {
  it('renders drag handles in the comfortable view', async () => {
    render(
      <MantineProvider>
        <ModalsProvider>
          <div data-testid="wrapper" style={{padding: '10px'}}>
            <CollectionPage.DocsList
              collection="BlogPosts"
              docs={MOCK_DOCS}
              orderBy="custom"
              reloadDocs={() => {}}
              reorderable
              onDocsChange={() => {}}
            />
          </div>
        </ModalsProvider>
      </MantineProvider>
    );
    const wrapper = page.getByTestId('wrapper');
    await expect.element(wrapper).toBeVisible();
    const handles = document.querySelectorAll(
      '.CollectionPage__collection__docsList__doc__handle'
    );
    expect(handles.length).toBe(3);
    // Rows render in the given (manual) order.
    const slugs = Array.from(
      document.querySelectorAll(
        '.CollectionPage__collection__docsList__doc__content__header__docId'
      )
    ).map((el) => el.textContent);
    expect(slugs).toEqual([
      'BlogPosts/first-post',
      'BlogPosts/second-post',
      'BlogPosts/third-post',
    ]);
  });

  it('renders drag handles in the compact view', async () => {
    render(
      <MantineProvider>
        <ModalsProvider>
          <div data-testid="wrapper" style={{padding: '10px'}}>
            <CollectionPage.DocsList
              collection="BlogPosts"
              docs={MOCK_DOCS}
              compact
              orderBy="custom"
              reloadDocs={() => {}}
              reorderable
              onDocsChange={() => {}}
            />
          </div>
        </ModalsProvider>
      </MantineProvider>
    );
    const wrapper = page.getByTestId('wrapper');
    await expect.element(wrapper).toBeVisible();
    const handles = document.querySelectorAll(
      '.CollectionPage__collection__docsList__doc__handle'
    );
    expect(handles.length).toBe(3);
    // The compact grid renders the extra handle column.
    const list = document.querySelector(
      '.CollectionPage__collection__docsList--compact'
    );
    expect(
      list?.classList.contains(
        'CollectionPage__collection__docsList--reorderable'
      )
    ).toBe(true);
  });

  it('renders no drag handles when reordering is disabled', async () => {
    render(
      <MantineProvider>
        <ModalsProvider>
          <div data-testid="wrapper" style={{padding: '10px'}}>
            <CollectionPage.DocsList
              collection="BlogPosts"
              docs={MOCK_DOCS}
              compact
              orderBy="modifiedAt"
              reloadDocs={() => {}}
            />
          </div>
        </ModalsProvider>
      </MantineProvider>
    );
    const wrapper = page.getByTestId('wrapper');
    await expect.element(wrapper).toBeVisible();
    const handles = document.querySelectorAll(
      '.CollectionPage__collection__docsList__doc__handle'
    );
    expect(handles.length).toBe(0);
  });
});
