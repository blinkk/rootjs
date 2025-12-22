import './DocPreviewCard.css';
import '../../styles/global.css';
import '../../styles/theme.css';

import {render} from '@testing-library/preact';
import {Timestamp} from 'firebase/firestore';
import {beforeAll, describe, expect, it} from 'vitest';
import {page} from 'vitest/browser';
import {setDocToCache} from '../../utils/doc-cache.js';
import {CMSDoc} from '../../utils/doc.js';
import {DocPreviewCard} from './DocPreviewCard.js';

describe('DocPreviewCard', () => {
  beforeAll(() => {
    window.__ROOT_CTX = {
      rootConfig: {
        projectId: 'test-project',
      },
      collections: {
        products: {
          preview: {
            title: 'title',
            image: 'image',
          },
        },
      },
    } as any;
    // Mock firebase to avoid errors if cache miss happens
    window.firebase = {
      db: {},
      user: {email: 'test@example.com'},
    } as any;
  });

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

  function createDoc(
    id: string,
    overrides: Partial<CMSDoc['sys']> = {}
  ): CMSDoc {
    const [collectionId, slug] = id.split('/');
    return {
      id: id,
      sys: {
        id: id,
        collectionId: collectionId,
        slug: slug,
        modifiedAt: mockTimestamp(1647485978000),
        modifiedBy: 'test@example.com',
        ...overrides,
      },
      fields: {
        title: 'Test Document',
        image: {
          src: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjMiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNjY2MiLz48L3N2Zz4=',
          width: 400,
          height: 300,
        },
      },
    } as unknown as CMSDoc;
  }

  it('renders default card', async () => {
    const doc = createDoc('products/test-doc');
    setDocToCache('products/test-doc', doc);
    render(
      <div data-testid="card-default" style={{width: '300px'}}>
        <DocPreviewCard docId="products/test-doc" doc={doc} />
      </div>
    );
    await expect.element(page.getByText('Test Document')).toBeVisible();
    await expect
      .element(page.getByTestId('card-default'))
      .toMatchScreenshot('DocPreviewCard-default.png');
  });

  it('renders compact card', async () => {
    const doc = createDoc('products/test-doc');
    setDocToCache('products/test-doc', doc);
    render(
      <div data-testid="card-compact" style={{width: '300px'}}>
        <DocPreviewCard docId="products/test-doc" doc={doc} variant="compact" />
      </div>
    );
    await expect.element(page.getByText('Test Document')).toBeVisible();
    await expect
      .element(page.getByTestId('card-compact'))
      .toMatchScreenshot('DocPreviewCard-compact.png');
  });

  it('renders with status badges', async () => {
    const doc = createDoc('products/test-doc', {
      publishedAt: mockTimestamp(1647485978000),
      publishedBy: 'test@example.com',
    });
    setDocToCache('products/test-doc', doc);
    render(
      <div data-testid="card-badges" style={{width: '300px'}}>
        <DocPreviewCard docId="products/test-doc" doc={doc} statusBadges />
      </div>
    );
    await expect.element(page.getByText('Published')).toBeVisible();
    await expect
      .element(page.getByTestId('card-badges'))
      .toMatchScreenshot('DocPreviewCard-badges.png');
  });

  it('renders compact with badges', async () => {
    const doc = createDoc('products/test-doc', {
      publishedAt: mockTimestamp(1647485978000),
      publishedBy: 'test@example.com',
    });
    setDocToCache('products/test-doc', doc);
    render(
      <div data-testid="card-compact-badges" style={{width: '300px'}}>
        <DocPreviewCard
          docId="products/test-doc"
          doc={doc}
          variant="compact"
          statusBadges
        />
      </div>
    );
    await expect.element(page.getByText('Published')).toBeVisible();
    await expect
      .element(page.getByTestId('card-compact-badges'))
      .toMatchScreenshot('DocPreviewCard-compact-badges.png');
  });
});
