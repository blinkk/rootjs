import {render} from '@testing-library/preact';
import {describe, it, expect} from 'vitest';
import {page} from 'vitest/browser';
import {CMSDoc} from '../../utils/doc.js';
import {DocStatusBadges} from './DocStatusBadges.js';

describe('DocStatusBadges', () => {
  it('renders draft badge', async () => {
    const doc = {
      sys: {
        id: 'test',
        collectionId: 'test',
        slug: 'test',
        modifiedAt: {toMillis: () => Date.now()},
        modifiedBy: 'test@example.com',
      },
      fields: {},
    } as unknown as CMSDoc;

    render(<DocStatusBadges doc={doc} />);
    const element = page.getByText('Draft');
    await expect.element(element).toBeVisible();
    await expect.element(element).toMatchScreenshot('draft-badge.png');
  });
});
