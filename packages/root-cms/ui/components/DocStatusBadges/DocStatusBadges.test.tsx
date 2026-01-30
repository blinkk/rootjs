import {render, screen, cleanup} from '@testing-library/preact';
import {describe, it, expect, vi, afterEach} from 'vitest';
import {CMSDoc} from '../../utils/doc.js';
import {DocStatusBadges} from './DocStatusBadges.js';

// Mock Mantine components to avoid context errors.
vi.mock('@mantine/core', () => ({
  Badge: ({children}: any) => <span data-testid="badge">{children}</span>,
  Tooltip: ({children, label}: any) => (
    <div data-testid="tooltip" title={label}>
      {children}
    </div>
  ),
}));

describe('DocStatusBadges', () => {
  afterEach(() => {
    cleanup();
  });
  it('does not throw when doc has invalid timestamp', () => {
    // Simulate a corrupted timestamp from the database.
    const docWithInvalidTimestamp: CMSDoc = {
      sys: {
        id: 'test',
        collectionId: 'test',
        slug: 'test',
        // Invalid timestamp: plain object without toMillis/toDate methods.
        modifiedAt: {seconds: 'invalid', nanoseconds: 0} as any,
        modifiedBy: 'test@example.com',
        publishedAt: {seconds: null, nanoseconds: null} as any,
        publishedBy: 'test@example.com',
      },
      fields: {},
    } as unknown as CMSDoc;

    // Should not throw an exception.
    expect(() => {
      render(<DocStatusBadges doc={docWithInvalidTimestamp} />);
    }).not.toThrow();
  });

  it('renders gracefully when modifiedAt is undefined', () => {
    const docWithUndefinedTimestamp: CMSDoc = {
      sys: {
        id: 'test',
        collectionId: 'test',
        slug: 'test',
        modifiedAt: undefined as any,
        modifiedBy: 'test@example.com',
      },
      fields: {},
    } as unknown as CMSDoc;

    expect(() => {
      render(<DocStatusBadges doc={docWithUndefinedTimestamp} />);
    }).not.toThrow();

    // The Draft badge should still render.
    expect(screen.getByText('Draft')).not.toBeNull();
  });

  it('renders gracefully when publishedAt is a malformed object', () => {
    const docWithMalformedPublishedAt: CMSDoc = {
      sys: {
        id: 'test',
        collectionId: 'test',
        slug: 'test',
        modifiedAt: {seconds: 1647485978, nanoseconds: 0} as any,
        modifiedBy: 'test@example.com',
        // Malformed: has seconds but toMillis throws.
        publishedAt: {
          seconds: 1647485978,
          nanoseconds: 0,
          toMillis: () => {
            throw new Error('Simulated error');
          },
          toDate: () => {
            throw new Error('Simulated error');
          },
        } as any,
        publishedBy: 'test@example.com',
      },
      fields: {},
    } as unknown as CMSDoc;

    expect(() => {
      render(<DocStatusBadges doc={docWithMalformedPublishedAt} />);
    }).not.toThrow();

    // The Published badge should still render since publishedAt is truthy.
    expect(screen.getByText('Published')).not.toBeNull();
  });
});
