import './DocPickerModal.css';
import {MantineProvider} from '@mantine/core';
import {render} from '@testing-library/preact';
import {Timestamp} from 'firebase/firestore';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {page} from 'vitest/browser';
import {CMSDoc} from '../../utils/doc.js';
import {DocPickerModal} from './DocPickerModal.js';

// Mock window.__ROOT_CTX
beforeEach(() => {
  (window as any).__ROOT_CTX = {
    collections: {
      BlogPosts: {
        name: 'Blog Posts',
        preview: {
          title: 'meta.title',
          image: 'meta.image',
        },
      },
      Pages: {
        name: 'Pages',
        preview: {
          title: 'meta.title',
          image: 'meta.image',
        },
      },
    },
    rootConfig: {
      projectId: 'test-project',
    },
  };
});

// Mock the useDocsList hook
vi.mock('../../hooks/useDocsList.js', () => ({
  useDocsList: vi.fn(() => {
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

    const mockDocs: CMSDoc[] = [
      {
        id: 'BlogPosts/rootjs-introducing-i-am',
        slug: 'rootjs-introducing-i-am',
        sys: {
          id: 'BlogPosts/rootjs-introducing-i-am',
          collectionId: 'BlogPosts',
          slug: 'rootjs-introducing-i-am',
          modifiedAt: mockTimestamp(1647485978000),
          modifiedBy: 'test@example.com',
        },
        fields: {
          meta: {
            title: 'Root.js, Introducing I Am',
            image: {
              src: '/images/logo.svg',
            },
          },
        },
      },
      {
        id: 'BlogPosts/lexical-html-test',
        slug: 'lexical-html-test',
        sys: {
          id: 'BlogPosts/lexical-html-test',
          collectionId: 'BlogPosts',
          slug: 'lexical-html-test',
          modifiedAt: mockTimestamp(1647485978000),
          modifiedBy: 'test@example.com',
          publishedAt: mockTimestamp(1647485978000),
          publishedBy: 'test@example.com',
        },
        fields: {
          meta: {
            title: '[UNTITLED]',
          },
        },
      },
      {
        id: 'BlogPosts/sandbox',
        slug: 'sandbox',
        sys: {
          id: 'BlogPosts/sandbox',
          collectionId: 'BlogPosts',
          slug: 'sandbox',
          modifiedAt: mockTimestamp(1647485978000),
          modifiedBy: 'test@example.com',
          publishingLocked: {
            lockedBy: 'test@example.com',
            lockedAt: 'some-date-string',
            reason: 'testing',
          },
        },
        fields: {
          meta: {
            title: 'Lexical editor test',
          },
        },
      },
    ];

    return [false, vi.fn(), mockDocs] as const;
  }),
}));

// Mock getDocServingUrl
vi.mock('../../utils/doc-urls.js', () => ({
  getDocServingUrl: vi.fn(
    ({slug}: {collectionId: string; slug: string}) =>
      `https://rootjs.dev/blog/${slug}/`
  ),
}));

describe('DocPickerModal', () => {
  it('renders single-select mode with all features', async () => {
    const modalProps = {
      context: 'DocPickerModal' as any,
      id: 'test-modal',
      innerProps: {
        collections: ['BlogPosts'],
        initialCollection: 'BlogPosts',
        onChange: vi.fn(),
        enableSearch: true,
        enableSort: true,
        enableCreate: true,
        enableStatusBadges: true,
      },
    };

    render(
      <MantineProvider>
        <div data-testid="wrapper" style={{width: '700px', padding: '20px'}}>
          <DocPickerModal {...modalProps} />
        </div>
      </MantineProvider>
    );

    const element = page.getByTestId('wrapper');
    await expect.element(element).toBeVisible();
    await expect
      .element(element)
      .toMatchScreenshot('single-select-all-features.png');
  });

  it('renders multi-select mode', async () => {
    const modalProps = {
      context: 'DocPickerModal' as any,
      id: 'test-modal',
      innerProps: {
        collections: ['BlogPosts'],
        initialCollection: 'BlogPosts',
        multiSelect: true,
        selectedDocIds: ['BlogPosts/sandbox'],
        onChangeMulti: vi.fn(),
        enableSearch: true,
        enableSort: true,
        enableCreate: true,
        enableStatusBadges: true,
      },
    };

    render(
      <MantineProvider>
        <div data-testid="wrapper" style={{width: '700px', padding: '20px'}}>
          <DocPickerModal {...modalProps} />
        </div>
      </MantineProvider>
    );

    const element = page.getByTestId('wrapper');
    await expect.element(element).toBeVisible();
    await expect.element(element).toMatchScreenshot('multi-select-mode.png');
  });

  it('renders with minimal features', async () => {
    const modalProps = {
      context: 'DocPickerModal' as any,
      id: 'test-modal',
      innerProps: {
        collections: ['BlogPosts'],
        initialCollection: 'BlogPosts',
        onChange: vi.fn(),
        enableSearch: false,
        enableSort: false,
        enableCreate: false,
        enableStatusBadges: false,
      },
    };

    render(
      <MantineProvider>
        <div data-testid="wrapper" style={{width: '700px', padding: '20px'}}>
          <DocPickerModal {...modalProps} />
        </div>
      </MantineProvider>
    );

    const element = page.getByTestId('wrapper');
    await expect.element(element).toBeVisible();
    await expect.element(element).toMatchScreenshot('minimal-features.png');
  });

  it('renders with multiple collections', async () => {
    const modalProps = {
      context: 'DocPickerModal' as any,
      id: 'test-modal',
      innerProps: {
        collections: ['BlogPosts', 'Pages'],
        onChange: vi.fn(),
        enableSearch: true,
        enableSort: true,
        enableCreate: true,
        enableStatusBadges: true,
      },
    };

    render(
      <MantineProvider>
        <div data-testid="wrapper" style={{width: '700px', padding: '20px'}}>
          <DocPickerModal {...modalProps} />
        </div>
      </MantineProvider>
    );

    const element = page.getByTestId('wrapper');
    await expect.element(element).toBeVisible();
    await expect.element(element).toMatchScreenshot('multiple-collections.png');
  });
});
