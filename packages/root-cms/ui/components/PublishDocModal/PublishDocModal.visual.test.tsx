import '../../styles/global.css';
import '../../styles/mantine.css';
import '../../styles/theme.css';
import './PublishDocModal.css';

import {MantineProvider} from '@mantine/core';
import {ModalsProvider, ContextModalProps} from '@mantine/modals';
import {cleanup, render} from '@testing-library/preact';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {page} from 'vitest/browser';
import {PublishDocModal, PublishDocModalProps} from './PublishDocModal.js';

// Mock firebase/firestore.
vi.mock('firebase/firestore', async (importOriginal) => {
  return {
    ...((await importOriginal()) as any),
    getFirestore: vi.fn(),
    doc: vi.fn(() => ({id: 'mock-doc-id', path: 'mock/path'})),
    collection: vi.fn(() => ({id: 'mock-collection-id', path: 'mock/path'})),
    getDoc: vi.fn(() =>
      Promise.resolve({
        exists: () => true,
        data: () => ({roles: {'test@example.com': 'ADMIN'}, fields: {}}),
      })
    ),
    getDocs: vi.fn(() =>
      Promise.resolve({
        forEach: (cb: any) => {
          // mock one doc
          cb({id: 'mock-doc', data: () => ({sys: {}, fields: {}})});
        },
        empty: false,
        size: 1,
      })
    ),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    documentId: vi.fn(),
    writeBatch: vi.fn(() => ({
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn(),
    })),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    arrayUnion: vi.fn(),
    runTransaction: vi.fn(),
    serverTimestamp: vi.fn(),
    deleteField: vi.fn(),
    Timestamp: {
      now: vi.fn(() => ({toMillis: () => Date.now()})),
      fromMillis: vi.fn((m) => ({toMillis: () => m})),
    },
  };
});

// Mock the doc utilities
vi.mock('../../utils/doc.js', () => ({
  cmsPublishDoc: vi.fn(),
  cmsScheduleDoc: vi.fn(),
  cmsGetDocDiffSummary: vi.fn(() =>
    Promise.resolve(
      '- Updated the hero title to "Dig into the spring harvest".\n- Added a new CTA linking to `/garden`.'
    )
  ),
  cmsReadDocVersion: vi.fn((docId: string, versionId: string) =>
    Promise.resolve({
      id: docId,
      sys: {},
      fields:
        versionId === 'published'
          ? {title: 'Spring harvest', cta: {label: 'Shop now'}}
          : {
              title: 'Dig into the spring harvest',
              cta: {label: 'Shop now', href: '/garden'},
            },
    })
  ),
  unmarshalData: vi.fn((data) => data),
  // Unused by the modal, but imported by its dependencies.
  cmsDeleteDoc: vi.fn(),
  cmsPublishDocs: vi.fn(),
  cmsSyncDependencyGraph: vi.fn(),
  cmsUnpublishDoc: vi.fn(),
  cmsRevertDraft: vi.fn(),
  cmsUnscheduleDoc: vi.fn(),
  cmsLockPublishing: vi.fn(),
  cmsUnlockPublishing: vi.fn(),
  cmsArchiveDoc: vi.fn(),
  cmsUnarchiveDoc: vi.fn(),
  cmsSetDocSortKey: vi.fn(),
  cmsAssignSortKeys: vi.fn(),
  fetchMaxSortKey: vi.fn(),
  testIsArchived: vi.fn(),
  testIsScheduled: vi.fn(),
  testPublishingLocked: vi.fn(),
  cmsCopyDoc: vi.fn(),
  cmsCreateDoc: vi.fn(),
  cmsDocImportTranslations: vi.fn(),
  getDraftDocRef: vi.fn(),
  getPublishedDocRef: vi.fn(),
  getVersionDocRef: vi.fn(),
  getDraftDocs: vi.fn(),
  cmsListVersions: vi.fn(),
  cmsRestoreVersion: vi.fn(),
  cmsLinkGoogleSheetL10n: vi.fn(),
  cmsUnlinkGoogleSheetL10n: vi.fn(),
  cmsGetLinkedGoogleSheetL10n: vi.fn(),
  marshalArray: vi.fn(),
  unmarshalArray: vi.fn(),
  parseDocId: vi.fn(),
  deserializeDocJson: vi.fn(),
}));

// Mock the doc cache used to look up referenced docs.
vi.mock('../../utils/doc-cache.js', () => ({
  getDocFromCacheOrFetch: vi.fn(() => Promise.resolve({fields: {}})),
}));

// Mock the publishing checks API.
vi.mock('../../utils/publish-checks.js', async (importOriginal) => {
  const original: any = await importOriginal();
  return {
    ...original,
    runPublishChecks: vi.fn(() =>
      Promise.resolve([
        {
          docId: 'Pages/spring-harvest',
          checkId: 'translations',
          label: 'Translations',
          level: 'required',
          status: 'success',
          message: 'All 6 locales complete.',
        },
        {
          docId: 'Pages/spring-harvest',
          checkId: 'alt-text',
          label: 'Image alt text',
          level: 'warning',
          status: 'warning',
          message: '2 images are missing alt text.',
        },
      ])
    ),
  };
});

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
  testIsAdmin: vi.fn(() => true),
}));

// Mock time utilities
vi.mock('../../utils/time.js', async (importOriginal) => ({
  ...((await importOriginal()) as any),
  getLocalISOString: vi.fn(() => '2026-01-29T12:00'),
}));
const ROOT_CTX = {
  experiments: {ai: true},
  rootConfig: {projectId: 'test-project'},
  collections: {
    Pages: {
      publishing: {
        checks: ['translations', {id: 'alt-text', level: 'warning'}],
      },
    },
  },
  checks: [
    {id: 'translations', label: 'Translations'},
    {id: 'alt-text', label: 'Image alt text'},
  ],
};

function renderModal(docId: string, size: {width: number; height: number}) {
  const props: ContextModalProps<PublishDocModalProps> = {
    context: {
      closeModal: () => {},
      closeAll: () => {},
      openModal: () => {},
      openConfirmModal: () => {},
      openContextModal: () => {},
    } as any,
    id: 'test-modal',
    innerProps: {docId},
  };
  render(
    <MantineProvider>
      <ModalsProvider>
        <div
          data-testid="wrapper"
          style={{
            width: size.width,
            minHeight: size.height,
            padding: 20,
            background: '#fff',
          }}
        >
          <PublishDocModal {...props} />
        </div>
      </ModalsProvider>
    </MantineProvider>
  );
}

describe('PublishDocModal', () => {
  beforeAll(() => {
    window.firebase = {
      db: {},
      storage: {
        app: {
          options: {
            storageBucket: 'test-bucket',
          },
        },
      },
      user: {
        email: 'test@example.com',
      },
    } as any;
  });

  beforeEach(() => {
    (window as any).__ROOT_CTX = ROOT_CTX;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders default state with AI enabled', async () => {
    await page.viewport(680, 600);
    renderModal('Pages/spring-harvest', {width: 640, height: 560});
    await expect
      .element(page.getByText('Publishing checks', {exact: true}))
      .toBeVisible();
    await expect
      .element(page.getByTestId('wrapper'))
      .toMatchScreenshot('publish-doc-modal-default.png');
  });

  it('renders scheduled state with changes and check results', async () => {
    await page.viewport(680, 1100);
    renderModal('Pages/spring-harvest', {width: 640, height: 1060});

    await page.getByRole('radio', {name: 'Schedule'}).click();
    await expect.element(page.getByLabelText('Publish at')).toBeVisible();
    await page.getByRole('button', {name: 'View diff'}).click();
    await page.getByRole('button', {name: 'Summarize'}).click();
    await page.getByRole('button', {name: 'Run checks'}).click();
    await page
      .getByRole('button', {name: 'Suggest a publish message with Root AI'})
      .hover();

    await expect.element(page.getByText('/garden').first()).toBeVisible();
    await expect
      .element(page.getByText('2 images are missing alt text.'))
      .toBeVisible();
    await expect
      .element(page.getByRole('button', {name: 'Run again'}))
      .toBeVisible();
    await expect
      .element(page.getByRole('button', {name: 'Schedule publish'}))
      .toBeVisible();
    await expect
      .element(page.getByTestId('wrapper'))
      .toMatchScreenshot('publish-doc-modal-scheduled.png');
  });

  it('renders publish confirmation with long doc id', async () => {
    (window as any).__ROOT_CTX = {
      experiments: {},
      rootConfig: {projectId: 'test-project'},
    };

    await page.viewport(640, 480);
    renderModal(
      'very-long-doc-id-that-should-break-word-and-wrap-to-the-next-line-to-avoid-overflowing-the-modal-content-area',
      {width: 640, height: 480}
    );

    await page.getByRole('button', {name: 'Publish', exact: true}).click();

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
