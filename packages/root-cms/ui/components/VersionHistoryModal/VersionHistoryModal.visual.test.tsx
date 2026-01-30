import '../../styles/global.css';
import '../../styles/theme.css';
import './VersionHistoryModal.css';

import {MantineProvider} from '@mantine/core';
import {ContextModalProps} from '@mantine/modals';
import {render, cleanup} from '@testing-library/preact';
import {Timestamp} from 'firebase/firestore';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {page} from 'vitest/browser';
import {Version} from '../../utils/doc.js';
import {
  VersionHistoryModal,
  VersionHistoryModalProps,
} from './VersionHistoryModal.js';

const style = document.createElement('style');
style.textContent = `
  [data-testid="wrapper"] {
    display: flex;
    flex-direction: column;
    padding: 20px;
    background: #fff;
  }
`;
document.head.appendChild(style);

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

const mockVersions: Version[] = [
  {
    _versionId: 'v3',
    sys: {
      modifiedAt: mockTimestamp(1647485978000 + 20000),
      modifiedBy: 'test@example.com',
    },
    tags: ['published', 'release:2024-01-launch'],
    commitMessage:
      'Update navigation menu\nFix broken links\nAdd new footer section',
  } as any,
  {
    _versionId: 'v2',
    sys: {
      modifiedAt: mockTimestamp(1647485978000 + 10000),
      modifiedBy: 'test@example.com',
    },
  } as any,
  {
    _versionId: 'v1',
    sys: {
      modifiedAt: mockTimestamp(1647485978000),
      modifiedBy: 'test@example.com',
    },
  } as any,
];

vi.mock('../../utils/doc.js', () => ({
  cmsListVersions: vi.fn(() => Promise.resolve(mockVersions)),
  cmsReadDocVersion: vi.fn(() =>
    Promise.resolve({
      sys: {
        modifiedAt: mockTimestamp(1647485978000 + 30000),
        modifiedBy: 'current-user@example.com',
      },
    })
  ),
  cmsRestoreVersion: vi.fn(),
}));

vi.mock('../CopyDocModal/CopyDocModal.js', () => ({
  useCopyDocModal: () => ({
    open: vi.fn(),
  }),
}));

vi.mock('../../hooks/useModalTheme.js', () => ({
  useModalTheme: () => ({}),
}));

function TestWrapper({children}: {children: any}) {
  return (
    <MantineProvider>
      <div data-testid="wrapper">{children}</div>
    </MantineProvider>
  );
}

beforeEach(async () => {
  await page.viewport(800, 600);
});

afterEach(() => {
  cleanup();
});

describe('VersionHistoryModal', () => {
  it('renders with versions', async () => {
    const modalProps: ContextModalProps<VersionHistoryModalProps> = {
      context: {
        closeModal: vi.fn(),
      } as any,
      id: 'test-modal',
      innerProps: {
        docId: 'BlogPosts/test-post',
      },
    };

    render(
      <TestWrapper>
        <VersionHistoryModal {...modalProps} />
      </TestWrapper>
    );

    const element = page.getByTestId('wrapper');
    await expect.element(element).toBeVisible();
    // Wait for loading to finish
    await expect.element(page.getByText('Version history')).toBeVisible();
    await expect
      .element(element)
      .toMatchScreenshot('version-history-modal.png');
  });

  it('filters published versions', async () => {
    const modalProps: ContextModalProps<VersionHistoryModalProps> = {
      context: {
        closeModal: vi.fn(),
      } as any,
      id: 'test-modal',
      innerProps: {
        docId: 'BlogPosts/test-post',
      },
    };

    render(
      <TestWrapper>
        <VersionHistoryModal {...modalProps} />
      </TestWrapper>
    );

    const element = page.getByTestId('wrapper');
    await expect.element(page.getByText('Version history')).toBeVisible();

    // Click the filter checkbox
    const checkbox = page.getByLabelText('Published versions only');
    await checkbox.click();

    await expect
      .element(element)
      .toMatchScreenshot('version-history-modal-filtered.png');
  });
});
