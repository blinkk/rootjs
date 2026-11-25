import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/preact';
import {LocationProvider} from 'preact-iso';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {PrototypeBoardSummary} from '../../../../../shared/prototypes.js';
import {ModalsProvider} from '../../../../primitives/modals/ModalsProvider.js';
import {
  apiCreatePrototypeBoard,
  apiDeletePrototypeBoard,
  apiDuplicatePrototypeBoard,
  apiListPrototypeBoards,
  apiUpdatePrototypeBoard,
  storeInitialPrototypePrompt,
} from '../../prototypes-client.js';
import {PrototypesPage} from './PrototypesPage.js';

const mockRoute = vi.fn();

vi.mock('preact-iso', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useLocation: () => ({
      url: '/cms/prototypes',
      path: '/cms/prototypes',
      query: {},
      route: mockRoute,
    }),
  };
});

vi.mock('../../../../app/layout/Layout.js', () => ({
  Layout: (props: {children: any}) => (
    <div className="Layout">{props.children}</div>
  ),
}));

vi.mock('../../../users/useProjectRoles.js', () => ({
  useProjectRoles: vi.fn(() => ({roles: {'editor@example.com': 'EDITOR'}})),
}));

vi.mock('../../../users/useUserProfile.js', () => ({
  useUserProfile: () => ({profile: null, loading: false}),
  useUserProfiles: () => ({profiles: new Map(), loading: false}),
}));

const mockOpenDocPicker = vi.fn();
vi.mock(
  '../../../collections/components/DocPickerModal/useDocPickerModal.js',
  () => ({
    useDocPickerModal: vi.fn(() => ({
      open: mockOpenDocPicker,
      close: vi.fn(),
    })),
  })
);

vi.mock('../../prototypes-client.js', () => ({
  apiListPrototypeBoards: vi.fn(),
  apiCreatePrototypeBoard: vi.fn(),
  apiUpdatePrototypeBoard: vi.fn(),
  apiDuplicatePrototypeBoard: vi.fn(),
  apiDeletePrototypeBoard: vi.fn(),
  storeInitialPrototypePrompt: vi.fn(),
}));

const SAMPLE_BOARDS: PrototypeBoardSummary[] = [
  {
    id: 'pricing-refresh',
    title: 'Pricing page refresh',
    description: 'Compare 2-tier and 3-tier matrices.',
    status: 'active',
    pages: [
      {id: 'explorations', name: 'Explorations'},
      {id: 'approved', name: 'Approved'},
    ],
    theme: {},
    createdAt: 1700000000000,
    createdBy: 'editor@example.com',
    updatedAt: 1700002000000,
    updatedBy: 'editor@example.com',
    frameCount: 3,
    pageFrameCounts: {explorations: 2, approved: 1},
    openCommentCount: 2,
    previewFrames: [
      {
        id: 'frame-1',
        title: 'Pricing A',
        width: 1440,
        blockLabels: [
          {label: 'Hero'},
          {label: 'Pricing matrix', proposed: true},
        ],
      },
    ],
  },
  {
    id: 'about-redesign',
    title: 'About page redesign',
    description: 'Team section explorations.',
    status: 'active',
    pages: [{id: 'explorations', name: 'Explorations'}],
    theme: {},
    createdAt: 1700000000000,
    createdBy: 'alice@example.com',
    updatedAt: 1700001000000,
    updatedBy: 'alice@example.com',
    frameCount: 5,
    pageFrameCounts: {explorations: 5},
    openCommentCount: 0,
  },
  {
    id: 'old-landing',
    title: 'Legacy landing',
    status: 'archived',
    pages: [{id: 'explorations', name: 'Explorations'}],
    theme: {},
    createdAt: 1690000000000,
    createdBy: 'editor@example.com',
    updatedAt: 1690000000000,
    updatedBy: 'editor@example.com',
    frameCount: 1,
    pageFrameCounts: {explorations: 1},
    openCommentCount: 0,
  },
];

function renderPage() {
  return render(
    <LocationProvider>
      <ModalsProvider>
        <PrototypesPage />
      </ModalsProvider>
    </LocationProvider>
  );
}

describe('PrototypesPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    (window as any).firebase = {user: {email: 'editor@example.com'}};
    vi.clearAllMocks();
    vi.mocked(apiListPrototypeBoards).mockResolvedValue(SAMPLE_BOARDS);
  });

  afterEach(() => {
    cleanup();
  });

  it('lists active boards, supports search, and switches to archived', async () => {
    const {getByLabelText, getByRole, queryByText, findByText} = renderPage();

    await findByText('Pricing page refresh');
    expect(queryByText('About page redesign')).not.toBeNull();
    expect(queryByText('Legacy landing')).toBeNull();

    // Search filters active boards by title or creator.
    const searchInput = getByLabelText('Search prototypes') as HTMLInputElement;
    fireEvent.input(searchInput, {target: {value: 'alice'}});
    expect(queryByText('About page redesign')).not.toBeNull();
    expect(queryByText('Pricing page refresh')).toBeNull();

    // Clearing search restores all active boards.
    fireEvent.click(getByLabelText('Clear search'));
    expect(queryByText('Pricing page refresh')).not.toBeNull();

    // Switching to Archived shows archived boards only.
    fireEvent.click(getByRole('radio', {name: /Archived/i}));
    expect(queryByText('Legacy landing')).not.toBeNull();
    expect(queryByText('Pricing page refresh')).toBeNull();
  });

  it('shows the empty state when there are no active boards', async () => {
    vi.mocked(apiListPrototypeBoards).mockResolvedValue([]);
    const {findByText} = renderPage();
    await findByText('No prototypes yet');
  });

  it('creates a new prototype with model selection and an initial AI prompt', async () => {
    (window as any).__ROOT_CTX = {
      ai: {
        defaultModel: 'claude-opus-5-5',
        models: [
          {
            id: 'claude-sonnet-5',
            label: 'Claude Sonnet 5',
            provider: 'anthropic',
            capabilities: {tools: true, reasoning: true, attachments: true},
          },
          {
            id: 'claude-opus-5-5',
            label: 'Claude Opus 5.5',
            provider: 'anthropic',
            capabilities: {tools: true, reasoning: true, attachments: true},
          },
        ],
      },
    };
    vi.mocked(apiCreatePrototypeBoard).mockResolvedValue({
      board: {
        id: 'new-board-1',
        title: 'Homepage v2',
        description: 'Fresh hero variants',
        status: 'active',
        pages: [{id: 'page-1', name: 'Page 1'}],
        theme: {},
        createdAt: 1700003000000,
        createdBy: 'editor@example.com',
        updatedAt: 1700003000000,
        updatedBy: 'editor@example.com',
      },
      frames: [],
      components: {},
      comments: [],
      annotations: [],
    });

    const {findByText, getByLabelText, getByRole} = renderPage();
    await findByText('Pricing page refresh');

    fireEvent.click(getByRole('button', {name: 'New prototype'}));

    const titleInput = getByLabelText(/^Title/i) as HTMLInputElement;
    const descInput = getByLabelText(/^Description/i) as HTMLTextAreaElement;
    const modelSelect = getByLabelText(/AI model/i);
    expect(modelSelect.textContent).toContain('Claude Opus 5.5');
    const promptInput = getByLabelText(
      /Initial AI prompt/i
    ) as HTMLTextAreaElement;

    fireEvent.input(titleInput, {target: {value: 'Homepage v2'}});
    fireEvent.input(descInput, {target: {value: 'Fresh hero variants'}});
    fireEvent.input(promptInput, {target: {value: 'Explore two hero layouts'}});

    await act(async () => {
      fireEvent.click(getByRole('button', {name: 'Create prototype'}));
    });

    await waitFor(() => {
      expect(apiCreatePrototypeBoard).toHaveBeenCalledWith({
        title: 'Homepage v2',
        description: 'Fresh hero variants',
        initialPrompt: 'Explore two hero layouts',
      });
    });
    expect(window.localStorage.getItem('root-cms.ai.selectedModel')).toBe(
      'claude-opus-5-5'
    );
    // The prompt is handed over out of band, never in the URL.
    expect(storeInitialPrototypePrompt).toHaveBeenCalledWith(
      'new-board-1',
      'Explore two hero layouts'
    );
    expect(mockRoute).toHaveBeenCalledWith('/cms/prototypes/new-board-1');
  });

  it('seeds a new prototype from an existing CMS document and grounds the initial prompt', async () => {
    (window as any).__ROOT_CTX = {
      collections: {
        Pages: {id: 'Pages', name: 'Pages'},
      },
      ai: {
        defaultModel: 'claude-sonnet-5',
        models: [
          {
            id: 'claude-sonnet-5',
            label: 'Claude Sonnet 5',
            provider: 'anthropic',
            capabilities: {tools: true, reasoning: true, attachments: true},
          },
        ],
      },
    };
    mockOpenDocPicker.mockImplementation(
      (opts?: {onChange?: (docId: string) => void}) => {
        opts?.onChange?.('Pages/pricing');
      }
    );
    vi.mocked(apiCreatePrototypeBoard).mockResolvedValue({
      board: {
        id: 'seeded-board',
        title: 'Pricing refresh',
        seedDocId: 'Pages/pricing',
        status: 'active',
        pages: [{id: 'page-1', name: 'Page 1'}],
        theme: {},
        createdAt: 1700004000000,
        createdBy: 'editor@example.com',
        updatedAt: 1700004000000,
        updatedBy: 'editor@example.com',
      },
      frames: [],
      components: {},
      comments: [],
      annotations: [],
    });

    const {findByText, getByRole} = renderPage();
    await findByText('Pricing page refresh');

    fireEvent.click(getByRole('button', {name: 'New prototype'}));
    fireEvent.click(getByRole('button', {name: 'Choose CMS document…'}));
    await findByText('Pages/pricing');

    await act(async () => {
      fireEvent.click(getByRole('button', {name: 'Create prototype'}));
    });

    await waitFor(() => {
      expect(apiCreatePrototypeBoard).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Pricing',
          seedDocId: 'Pages/pricing',
          initialPrompt: expect.stringContaining('Pages/pricing'),
        })
      );
    });
    expect(storeInitialPrototypePrompt).toHaveBeenCalledWith(
      'seeded-board',
      expect.stringContaining('Pages/pricing')
    );
    expect(mockRoute).toHaveBeenCalledWith('/cms/prototypes/seeded-board');
  });

  it('supports duplicating, archiving, and deleting a board from its menu', async () => {
    vi.mocked(apiDuplicatePrototypeBoard).mockResolvedValue({
      ...SAMPLE_BOARDS[0],
      id: 'pricing-copy',
      title: 'Pricing page refresh (copy)',
      updatedAt: 1700005000000,
    });
    vi.mocked(apiUpdatePrototypeBoard).mockResolvedValue({
      ...SAMPLE_BOARDS[0],
      status: 'archived',
    });
    vi.mocked(apiDeletePrototypeBoard).mockResolvedValue();

    const {findByText, getByLabelText, getByRole, queryByText} = renderPage();
    await findByText('Pricing page refresh');

    // Duplicate.
    fireEvent.click(getByLabelText('Actions for Pricing page refresh'));
    await act(async () => {
      fireEvent.click(getByRole('menuitem', {name: 'Duplicate'}));
    });
    await findByText('Pricing page refresh (copy)');

    // Archive.
    fireEvent.click(getByLabelText('Actions for Pricing page refresh'));
    await act(async () => {
      fireEvent.click(getByRole('menuitem', {name: 'Archive'}));
    });
    await waitFor(() => {
      expect(queryByText('Pricing page refresh')).toBeNull();
    });

    // Delete duplicated board via confirmation dialog.
    fireEvent.click(getByLabelText('Actions for Pricing page refresh (copy)'));
    fireEvent.click(getByRole('menuitem', {name: 'Delete…'}));
    await act(async () => {
      fireEvent.click(getByRole('button', {name: 'Delete'}));
    });
    await waitFor(() => {
      expect(apiDeletePrototypeBoard).toHaveBeenCalledWith('pricing-copy');
      expect(queryByText('Pricing page refresh (copy)')).toBeNull();
    });
  });
});
