import '../../styles/global.css';
import '../../styles/theme.css';
import './PublishDocModal.css';

import {MantineProvider} from '@mantine/core';
import {ModalsProvider, ContextModalProps} from '@mantine/modals';
import {render} from '@testing-library/preact';
import {describe, it, expect, beforeAll, vi} from 'vitest';
import {page} from 'vitest/browser';
import {PublishDocModal, PublishDocModalProps} from './PublishDocModal.js';

// Mock firebase/firestore.
vi.mock('firebase/firestore', async (importOriginal) => {
  const mod = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...mod,
    doc: vi.fn(),
    getDoc: vi.fn().mockResolvedValue({
      data: () => ({roles: {'test@example.com': 'ADMIN'}}),
    }),
  };
});

// Mock the doc utilities
vi.mock('../../utils/doc.js', () => ({
  cmsPublishDoc: vi.fn(),
  cmsScheduleDoc: vi.fn(),
  cmsGetDocDiffSummary: vi.fn(),
  cmsReadDocVersion: vi.fn(),
  unmarshalData: vi.fn((data) => data),
}));

// Mock the useProjectRoles hook
vi.mock('../../hooks/useProjectRoles.js', () => ({
  useProjectRoles: () => ({
    roles: {},
    loading: false,
  }),
}));

// Mock permissions
vi.mock('../../utils/permissions.js', () => ({
  testCanPublish: vi.fn(() => true),
}));

// Mock time utilities
vi.mock('../../utils/time.js', () => ({
  getLocalISOString: vi.fn(() => '2026-01-29T12:00'),
}));

describe('PublishDocModal', () => {
  beforeAll(() => {
    (window as any).__ROOT_CTX = {
      experiments: {},
      rootConfig: {
        projectId: 'test-project',
      },
    };
    (window as any).firebase = {
      user: {
        email: 'test@example.com',
      },
      db: {},
    };
  });

  it('renders default state with AI experiment enabled', async () => {
    (window as any).__ROOT_CTX = {
      experiments: {ai: true},
      rootConfig: {projectId: 'test-project'},
    };

    await page.viewport(850, 600);
    const props: ContextModalProps<PublishDocModalProps> = {
      context: {
        closeModal: () => {},
        closeAll: () => {},
        openModal: () => {},
        openConfirmModal: () => {},
        openContextModal: () => {},
      } as any,
      id: 'test-modal',
      innerProps: {
        docId: 'blog/my-first-post',
      },
    };

    render(
      <MantineProvider>
        <ModalsProvider>
          <div
            data-testid="wrapper"
            style={{width: 850, height: 600, padding: 20, background: '#fff'}}
          >
            <PublishDocModal {...props} />
          </div>
        </ModalsProvider>
      </MantineProvider>
    );

    await expect
      .element(page.getByTestId('wrapper'))
      .toMatchScreenshot('publish-doc-modal-default.png');
  });

  it('renders publish confirmation with long doc id', async () => {
    // Reset experiments
    (window as any).__ROOT_CTX = {
      experiments: {},
      rootConfig: {projectId: 'test-project'},
    };

    await page.viewport(640, 480);
    const props: ContextModalProps<PublishDocModalProps> = {
      context: {
        closeModal: () => {},
        closeAll: () => {},
        openModal: () => {},
        openConfirmModal: () => {},
        openContextModal: () => {},
      } as any,
      id: 'test-modal',
      innerProps: {
        docId:
          'very-long-doc-id-that-should-break-word-and-wrap-to-the-next-line-to-avoid-overflowing-the-modal-content-area',
      },
    };

    render(
      <MantineProvider>
        <ModalsProvider>
          <div
            data-testid="wrapper"
            style={{width: 640, height: 480, padding: 20, background: '#fff'}}
          >
            <PublishDocModal {...props} />
          </div>
        </ModalsProvider>
      </MantineProvider>
    );

    // Select "Publish now"
    await page.getByText('Now').first().click();

    // Click "Publish" button
    await page.getByRole('button', {name: 'Publish'}).first().click();

    // Now the confirm modal should appear.
    await expect
      .element(page.getByText('Are you sure you want to publish'))
      .toBeVisible();
    await expect.element(page.getByTestId('doc-id')).toBeVisible();

    await expect
      .element(page.getByTestId('wrapper').first())
      .toMatchScreenshot('publish-doc-modal.png');
  });
});
