import '../../styles/global.css';
import '../../styles/theme.css';

import {MantineProvider} from '@mantine/core';
import {render} from '@testing-library/preact';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {page} from 'vitest/browser';
import {Viewers} from './Viewers.js';

// Mock firebase/firestore.
const {mockOnSnapshot} = vi.hoisted(() => {
  return {mockOnSnapshot: vi.fn()};
});

vi.mock('firebase/firestore', async (importOriginal) => {
  const mod = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...mod,
    getFirestore: vi.fn(),
    doc: vi.fn(),
    onSnapshot: mockOnSnapshot,
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    serverTimestamp: vi.fn(),
    Timestamp: {
      now: () => ({toMillis: () => Date.now()}),
    },
  };
});

// Mock window.__ROOT_CTX.
window.__ROOT_CTX = {
  rootConfig: {
    projectId: 'test-project',
  },
} as any;

// Mock window.firebase.
window.firebase = {
  db: {},
  user: {
    email: 'me@example.com',
    photoURL: 'https://example.com/me.jpg',
  },
} as any;

describe('Viewers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders viewers and tooltip', async () => {
    page.viewport(400, 200);

    // Mock data.
    // Use a plain object with toMillis to avoid potential Timestamp instance issues across mocks.
    const nowMillis = Date.now();
    const mockTimestamp = {toMillis: () => nowMillis};

    const viewersData = {
      'user1@example.com': {
        email: 'user1@example.com',
        photoURL:
          'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22150%22%20height%3D%22150%22%20viewBox%3D%220%200%20150%20150%22%3E%3Crect%20width%3D%22150%22%20height%3D%22150%22%20fill%3D%22%23ddd%22%20%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%22%20font-size%3D%2250%22%3EBL%3C%2Ftext%3E%3C%2Fsvg%3E',
        lastViewedAt: mockTimestamp,
      },
      'user2@example.com': {
        email: 'user2@example.com',
        photoURL:
          'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22150%22%20height%3D%22150%22%20viewBox%3D%220%200%20150%20150%22%3E%3Crect%20width%3D%22150%22%20height%3D%22150%22%20fill%3D%22%23ddd%22%20%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%22%20font-size%3D%2250%22%3EKK%3C%2Ftext%3E%3C%2Fsvg%3E',
        lastViewedAt: mockTimestamp,
      },
      'user3@example.com': {
        email: 'user3@example.com',
        photoURL: '', // No photo (shows first letter of email).
        lastViewedAt: mockTimestamp,
      },
    };

    mockOnSnapshot.mockImplementation((ref, callback) => {
      callback({
        data: () => viewersData,
      });
      return () => {}; // Unsubscribe function.
    });

    render(
      <MantineProvider>
        <div style={{padding: 50}} data-testid="viewers-container">
          <Viewers id="test-doc" />
        </div>
      </MantineProvider>
    );

    expect(mockOnSnapshot).toHaveBeenCalled();

    const element = page.getByTestId('viewers-container');

    // Check if Viewers container is rendered.
    await expect.element(element).toBeVisible();

    // Wait for avatars to appear.
    await expect
      .element(element.getByRole('img', {name: 'user1@example.com'}))
      .toBeVisible();
    await expect
      .element(element.getByRole('img', {name: 'user2@example.com'}))
      .toBeVisible();
    await expect.element(element.getByText('U')).toBeVisible(); // Initial for user3.

    // Hover over the first user to show tooltip.
    await element.getByRole('img', {name: 'user1@example.com'}).hover();

    // Verify tooltip is visible.
    await expect.element(page.getByText('user1@example.com')).toBeVisible();

    await expect.element(element).toMatchScreenshot('Viewers-tooltip.png');
  });

  it('renders single viewer', async () => {
    page.viewport(400, 200);

    const nowMillis = Date.now();
    const mockTimestamp = {toMillis: () => nowMillis};

    const viewersData = {
      'user1@example.com': {
        email: 'user1@example.com',
        photoURL:
          'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22150%22%20height%3D%22150%22%20viewBox%3D%220%200%20150%20150%22%3E%3Crect%20width%3D%22150%22%20height%3D%22150%22%20fill%3D%22%23ddd%22%20%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%22%20font-size%3D%2250%22%3EBL%3C%2Ftext%3E%3C%2Fsvg%3E',
        lastViewedAt: mockTimestamp,
      },
    };

    mockOnSnapshot.mockImplementation((ref, callback) => {
      callback({
        data: () => viewersData,
      });
      return () => {};
    });

    render(
      <MantineProvider>
        <div style={{padding: 50}} data-testid="viewers-container-single">
          <Viewers id="test-doc" />
        </div>
      </MantineProvider>
    );

    const element = page.getByTestId('viewers-container-single');
    await expect.element(element).toBeVisible();
    await expect
      .element(element.getByRole('img', {name: 'user1@example.com'}))
      .toBeVisible();
    await expect.element(element).toMatchScreenshot('Viewers-single.png');
  });

  it('renders many viewers with overflow', async () => {
    page.viewport(400, 200);

    const nowMillis = Date.now();
    const mockTimestamp = {toMillis: () => nowMillis};

    const viewersData: Record<string, any> = {};
    for (let i = 1; i <= 5; i++) {
      viewersData[`user${i}@example.com`] = {
        email: `user${i}@example.com`,
        photoURL: '',
        lastViewedAt: mockTimestamp,
      };
    }

    mockOnSnapshot.mockImplementation((ref, callback) => {
      callback({
        data: () => viewersData,
      });
      return () => {};
    });

    render(
      <MantineProvider>
        <div style={{padding: 50}} data-testid="viewers-container-overflow">
          <Viewers id="test-doc" />
        </div>
      </MantineProvider>
    );

    const element = page.getByTestId('viewers-container-overflow');
    await expect.element(element).toBeVisible();

    // So with 5 viewers, we should see 3 avatars and a +2 indicator.
    // The overflow indicator is rendered as an Avatar with text "+2".

    await expect.element(element.getByText('+2')).toBeVisible();
    await expect.element(element).toMatchScreenshot('Viewers-overflow.png');
  });
});
