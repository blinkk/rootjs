import '../../styles/global.css';
import '../../styles/theme.css';
import './DocPickerModal.css';

import {MantineProvider} from '@mantine/core';
import {ContextModalProps} from '@mantine/modals';
import {render, cleanup} from '@testing-library/preact';
import {Timestamp} from 'firebase/firestore';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {page} from 'vitest/browser';
import {CMSDoc} from '../../utils/doc.js';
import {DocPickerModal, DocPickerModalProps} from './DocPickerModal.js';

const style = document.createElement('style');
style.textContent = `
  [data-testid="wrapper"] {
    display: flex;
    flex-direction: column;
  }
  [data-testid="wrapper"] .DocPickerModal {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
`;
document.head.appendChild(style);

beforeEach(async () => {
  await page.viewport(640, 480);

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

afterEach(() => {
  cleanup();
});

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
        collection: 'BlogPosts',
        slug: 'rootjs-introducing-i-am',
        sys: {
          createdAt: mockTimestamp(1647485978000),
          createdBy: 'test@example.com',
          modifiedAt: mockTimestamp(1647485978000),
          modifiedBy: 'test@example.com',
          firstPublishedAt: mockTimestamp(0),
          firstPublishedBy: 'test@example.com',
          publishedAt: mockTimestamp(0),
          publishedBy: 'test@example.com',
        },
        fields: {
          meta: {
            title: 'Root.js, Introducing I Am',
          },
        },
      },
      {
        id: 'BlogPosts/lexical-html-test',
        collection: 'BlogPosts',
        slug: 'lexical-html-test',
        sys: {
          createdAt: mockTimestamp(1647485978000),
          createdBy: 'test@example.com',
          modifiedAt: mockTimestamp(1647485978000),
          modifiedBy: 'test@example.com',
        },
        fields: {
          meta: {
            title: '[UNTITLED]',
          },
        },
      },
      {
        id: 'BlogPosts/sandbox',
        collection: 'BlogPosts',
        slug: 'sandbox',
        sys: {
          createdAt: mockTimestamp(1647485978000),
          createdBy: 'test@example.com',
          modifiedAt: mockTimestamp(1647485978000),
          modifiedBy: 'test@example.com',
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

vi.mock('../../utils/doc-urls.js', () => ({
  getDocServingUrl: vi.fn(
    ({slug}: {collectionId: string; slug: string}) =>
      `https://rootjs.dev/blog/${slug}/`
  ),
}));

vi.mock('../NewDocModal/NewDocModal.js', () => ({
  NewDocModal: () => null,
}));

function TestWrapper({children}: {children: any}) {
  return (
    <MantineProvider>
      <div data-testid="wrapper" style={{padding: '20px'}}>
        {children}
      </div>
    </MantineProvider>
  );
}

describe('DocPickerModal', () => {
  it('renders single-select mode with all features', async () => {
    const modalProps: ContextModalProps<DocPickerModalProps> = {
      context: {} as any,
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
      <TestWrapper>
        <DocPickerModal {...modalProps} />
      </TestWrapper>
    );

    const element = page.getByTestId('wrapper');
    await expect.element(element).toBeVisible();
    await expect
      .element(element)
      .toMatchScreenshot('single-select-all-features.png');
  });

  it('renders multi-select mode', async () => {
    const modalProps: ContextModalProps<DocPickerModalProps> = {
      context: {} as any,
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
      <TestWrapper>
        <DocPickerModal {...modalProps} />
      </TestWrapper>
    );

    const element = page.getByTestId('wrapper');
    await expect.element(element).toBeVisible();
    await expect.element(element).toMatchScreenshot('multi-select-mode.png');
  });

  it('renders with minimal features', async () => {
    const modalProps: ContextModalProps<DocPickerModalProps> = {
      context: {} as any,
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
      <TestWrapper>
        <DocPickerModal {...modalProps} />
      </TestWrapper>
    );

    const element = page.getByTestId('wrapper');
    await expect.element(element).toBeVisible();
    await expect.element(element).toMatchScreenshot('minimal-features.png');
  });

  it('renders with multiple collections', async () => {
    const modalProps: ContextModalProps<DocPickerModalProps> = {
      context: {} as any,
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
      <TestWrapper>
        <DocPickerModal {...modalProps} />
      </TestWrapper>
    );

    const element = page.getByTestId('wrapper');
    await expect.element(element).toBeVisible();
    await expect.element(element).toMatchScreenshot('multiple-collections.png');
  });
});
