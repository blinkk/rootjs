import '../../pages/CollectionPage/CollectionPage.css';
import {render} from '@testing-library/preact';
import {Timestamp} from 'firebase/firestore';
import {describe, it, expect} from 'vitest';
import {page} from 'vitest/browser';
import {CMSDoc} from '../../utils/doc.js';
import {DocStatusBadges} from './DocStatusBadges.js';

describe('DocStatusBadges', () => {
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

  function createDoc(overrides: Partial<CMSDoc['sys']> = {}): CMSDoc {
    return {
      sys: {
        id: 'test',
        collectionId: 'test',
        slug: 'test',
        modifiedAt: mockTimestamp(1647485978000), // Wed Mar 16 19:59:38 2022 -0700
        modifiedBy: 'test@example.com',
        ...overrides,
      },
      fields: {},
    } as unknown as CMSDoc;
  }

  it('renders all badges', async () => {
    const draftDoc = createDoc();
    const publishedDoc = createDoc({
      publishedAt: mockTimestamp(1647485978000),
      publishedBy: 'test@example.com',
    });
    const lockedDoc = createDoc({
      publishingLocked: {
        lockedBy: 'test@example.com',
        lockedAt: 'some-date-string',
        reason: 'testing',
      },
    });
    const scheduledDoc = createDoc({
      scheduledAt: mockTimestamp(1647485978000 + 100000),
      scheduledBy: 'test@example.com',
    });

    render(
      <div
        style={{
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
        data-testid="wrapper"
      >
        <div>
          <DocStatusBadges doc={draftDoc} />
        </div>
        <div>
          <DocStatusBadges doc={publishedDoc} />
        </div>
        <div>
          <DocStatusBadges doc={lockedDoc} />
        </div>
        <div>
          <DocStatusBadges doc={scheduledDoc} />
        </div>
      </div>
    );
    const element = page.getByTestId('wrapper');
    await expect.element(element).toBeVisible();
    await expect.element(element).toMatchScreenshot('all-badges.png');
  });
});
