import {cleanup, fireEvent, render, waitFor} from '@testing-library/preact';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {PrototypeBoardBundle} from '../../../../../shared/prototypes.js';
import {ModalsProvider} from '../../../../primitives/modals/ModalsProvider.js';
import {
  apiClearPrototypeAiChat,
  apiGetPrototypeAiChat,
  apiGetPrototypeBoard,
  apiGetPrototypeContext,
  apiMovePrototypeItems,
  apiSavePrototypeFrame,
  takeInitialPrototypePrompt,
} from '../../prototypes-client.js';
import {PrototypeBoardPage} from './PrototypeBoardPage.js';

let mockQuery: Record<string, string> = {};
const mockRoute = vi.fn();

vi.mock('preact-iso', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useRoute: () => ({params: {boardId: 'pricing-board'}}),
    useLocation: () => ({
      url: '/cms/prototypes/pricing-board',
      path: '/cms/prototypes/pricing-board',
      query: mockQuery,
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
  useProjectRoles: vi.fn(() => ({
    roles: {'editor@example.com': 'EDITOR'},
    loading: false,
  })),
}));

vi.mock('../../../users/useUserProfile.js', () => ({
  useUserProfile: () => ({profile: null, loading: false}),
  useUserProfiles: () => ({profiles: new Map(), loading: false}),
}));

vi.mock('../../prototypes-client.js', () => ({
  apiGetPrototypeBoard: vi.fn(),
  apiGetPrototypeContext: vi.fn(),
  apiMovePrototypeItems: vi.fn(),
  apiGetPrototypeAiChat: vi.fn(),
  apiSavePrototypeAiChat: vi.fn(),
  apiClearPrototypeAiChat: vi.fn(),
  apiUpdatePrototypeBoard: vi.fn(),
  apiSavePrototypeFrame: vi.fn(),
  apiDeletePrototypeFrame: vi.fn(),
  apiSavePrototypeAnnotation: vi.fn(),
  apiDeletePrototypeAnnotation: vi.fn(),
  apiSavePrototypeComponent: vi.fn(),
  apiAddPrototypeComment: vi.fn(),
  apiSetPrototypeCommentStatus: vi.fn(),
  apiMovePrototypeComment: vi.fn(),
  apiDeletePrototypeComment: vi.fn(),
  apiDuplicatePrototypeBoard: vi.fn(),
  apiDeletePrototypeBoard: vi.fn(),
  apiPreparePrototypeAiTurn: vi.fn(),
  takeInitialPrototypePrompt: vi.fn(() => null),
}));

function makeSampleBundle(): PrototypeBoardBundle {
  return {
    board: {
      id: 'pricing-board',
      title: 'Pricing Exploration',
      status: 'active',
      pages: [
        {id: 'page-1', name: 'Desktop'},
        {id: 'page-2', name: 'Mobile'},
      ],
      theme: {},
      createdAt: 1700000000000,
      createdBy: 'editor@example.com',
      updatedAt: 1700000000000,
      updatedBy: 'editor@example.com',
    },
    frames: [
      {
        id: 'frame-a',
        boardId: 'pricing-board',
        pageId: 'page-1',
        title: 'Pricing A',
        width: 400,
        x: 100,
        y: 100,
        cachedHeight: 300,
        blocks: {_array: []},
        createdAt: 1700000000000,
        createdBy: 'editor@example.com',
        updatedAt: 1700000000000,
        updatedBy: 'editor@example.com',
      },
      {
        id: 'frame-b',
        boardId: 'pricing-board',
        pageId: 'page-1',
        title: 'Pricing B',
        width: 400,
        x: 600,
        y: 100,
        cachedHeight: 300,
        blocks: {_array: []},
        createdAt: 1700000001000,
        createdBy: 'editor@example.com',
        updatedAt: 1700000001000,
        updatedBy: 'editor@example.com',
      },
      {
        id: 'frame-mobile',
        boardId: 'pricing-board',
        pageId: 'page-2',
        title: 'Mobile Checkout',
        width: 390,
        x: 2400,
        y: 800,
        cachedHeight: 844,
        blocks: {_array: []},
        createdAt: 1700000002000,
        createdBy: 'editor@example.com',
        updatedAt: 1700000002000,
        updatedBy: 'editor@example.com',
      },
    ],
    components: {},
    comments: [],
    annotations: [
      {
        id: 'note-1',
        boardId: 'pricing-board',
        pageId: 'page-1',
        kind: 'note',
        text: 'Try annual toggle',
        x: 150,
        y: 450,
        createdAt: 1700000000000,
        createdBy: 'editor@example.com',
        updatedAt: 1700000000000,
        updatedBy: 'editor@example.com',
      },
      {
        id: 'label-1',
        boardId: 'pricing-board',
        pageId: 'page-1',
        kind: 'label',
        text: 'Round 1',
        x: 100,
        y: 20,
        createdAt: 1700000000000,
        createdBy: 'editor@example.com',
        updatedAt: 1700000000000,
        updatedBy: 'editor@example.com',
      },
    ],
  };
}

describe('PrototypeBoardPage', () => {
  beforeEach(() => {
    mockQuery = {};
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/cms/prototypes/pricing-board');
    (window as any).firebase = {user: {email: 'editor@example.com'}};
    (window as any).__ROOT_CTX = {
      rootConfig: {projectId: 'www'},
      firebaseConfig: {storageBucket: 'demo.appspot.com'},
      ai: {
        enabled: true,
        defaultModel: 'claude-sonnet-5',
        models: [
          {
            id: 'claude-sonnet-5',
            label: 'Claude Sonnet 5',
            provider: 'anthropic',
            capabilities: {tools: true, reasoning: false, attachments: false},
          },
        ],
      },
    };
    vi.clearAllMocks();
    vi.mocked(apiGetPrototypeBoard).mockImplementation(async () =>
      makeSampleBundle()
    );
    vi.mocked(apiGetPrototypeContext).mockResolvedValue({
      projectName: 'Root.js',
      schemas: [],
      defaultTheme: {},
    });
    vi.mocked(apiMovePrototypeItems).mockResolvedValue({
      movedFrames: 2,
      movedAnnotations: 2,
    });
    vi.mocked(apiGetPrototypeAiChat).mockResolvedValue({session: null});
    vi.mocked(apiClearPrototypeAiChat).mockResolvedValue({cleared: true});
    vi.mocked(takeInitialPrototypePrompt).mockReturnValue(null);
    vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
      if (String(input).includes('/cms/api/ai.config')) {
        return new Response(
          JSON.stringify({
            enabled: true,
            defaultModel: 'claude-sonnet-5',
            models: (window as any).__ROOT_CTX.ai.models,
            skills: [],
          }),
          {status: 200, headers: {'Content-Type': 'application/json'}}
        );
      }
      return new Response('{}', {status: 200});
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('deeplinks directly to a frame on another page and focuses the camera on it', async () => {
    mockQuery = {frame: 'frame-mobile'};
    window.history.replaceState(
      null,
      '',
      '/cms/prototypes/pricing-board?frame=frame-mobile'
    );

    const view = render(
      <ModalsProvider>
        <PrototypeBoardPage boardId="pricing-board" />
      </ModalsProvider>
    );

    await waitFor(() => {
      const mobileFrame = view.container.querySelector(
        '[data-frame-id="frame-mobile"]'
      );
      expect(mobileFrame).not.toBeNull();
      expect(mobileFrame?.classList.contains('PrototypeFrame--selected')).toBe(
        true
      );
      expect(window.location.search).toContain('page=page-2');
      expect(window.location.search).toContain('frame=frame-mobile');
    });

    const world = view.container.querySelector(
      '.PrototypeCanvas__world'
    ) as HTMLElement;
    expect(world.style.transform).toContain('translate3d(');
    // Mobile frame sits at x=2400, so focusing translates camera into negative X.
    expect(world.style.transform).toMatch(/translate3d\(-\d+/);
  });

  it('drag-selects multiple frames, notes, and text labels and moves them as a group', async () => {
    const view = render(
      <ModalsProvider>
        <PrototypeBoardPage boardId="pricing-board" />
      </ModalsProvider>
    );

    await waitFor(() => {
      expect(
        view.container.querySelector('[data-frame-id="frame-a"]')
      ).not.toBeNull();
    });

    const canvas = view.container.querySelector(
      '.PrototypeCanvas'
    ) as HTMLElement;

    // Drag a large marquee box across the entire active page.
    fireEvent.pointerDown(canvas, {button: 0, clientX: 5, clientY: 5});
    fireEvent.pointerMove(window, {clientX: 1200, clientY: 800});
    expect(
      view.container.querySelector('.PrototypeCanvas__marquee')
    ).not.toBeNull();
    fireEvent.pointerUp(window, {clientX: 1200, clientY: 800});

    const frameA = view.container.querySelector(
      '[data-frame-id="frame-a"]'
    ) as HTMLElement;
    const frameB = view.container.querySelector(
      '[data-frame-id="frame-b"]'
    ) as HTMLElement;
    const noteBtn = view.container.querySelector(
      '[data-annotation-id="note-1"] button'
    ) as HTMLElement;
    const labelBtn = view.container.querySelector(
      '[data-annotation-id="label-1"] button'
    ) as HTMLElement;

    expect(frameA.classList.contains('PrototypeFrame--selected')).toBe(true);
    expect(frameB.classList.contains('PrototypeFrame--selected')).toBe(true);
    expect(noteBtn.getAttribute('aria-pressed')).toBe('true');
    expect(labelBtn.getAttribute('aria-pressed')).toBe('true');

    // Drag the selected note by +100 screen px horizontally and +50 vertically.
    fireEvent.pointerDown(noteBtn, {button: 0, clientX: 200, clientY: 200});
    fireEvent.pointerMove(window, {clientX: 300, clientY: 250});
    fireEvent.pointerUp(window, {clientX: 300, clientY: 250});

    await waitFor(() => {
      expect(apiMovePrototypeItems).toHaveBeenCalledTimes(1);
    });
    const callArg = vi.mocked(apiMovePrototypeItems).mock.calls[0][0];
    expect(callArg.boardId).toBe('pricing-board');
    expect(callArg.frames?.map((f) => f.id)).toEqual(['frame-a', 'frame-b']);
    expect(callArg.annotations?.map((a) => a.id)).toEqual([
      'note-1',
      'label-1',
    ]);
    // Both frames shifted by the exact same positive delta from their (100, 100) and (600, 100) origins.
    const dxFrameA = callArg.frames![0].x - 100;
    const dxFrameB = callArg.frames![1].x - 600;
    const dxNote = callArg.annotations![0].x - 150;
    const dxLabel = callArg.annotations![1].x - 100;
    expect(dxFrameA).toBeGreaterThan(50);
    expect(dxFrameB).toBe(dxFrameA);
    expect(dxNote).toBe(dxFrameA);
    expect(dxLabel).toBe(dxFrameA);
  });

  it('persists the tab session scroll and zoom position when returning to the board', async () => {
    const firstVisit = render(
      <ModalsProvider>
        <PrototypeBoardPage boardId="pricing-board" />
      </ModalsProvider>
    );

    await waitFor(() => {
      expect(
        firstVisit.container.querySelector('.PrototypeCanvas')
      ).not.toBeNull();
    });

    const canvas = firstVisit.container.querySelector(
      '.PrototypeCanvas'
    ) as HTMLElement;

    // Pan with two-finger wheel scroll and zoom in via the dock button.
    fireEvent.wheel(canvas, {deltaX: 320, deltaY: 180});
    const zoomInBtn = firstVisit.getByLabelText('Zoom in (+)');
    fireEvent.click(zoomInBtn);

    const worldBefore = (
      firstVisit.container.querySelector(
        '.PrototypeCanvas__world'
      ) as HTMLElement
    ).style.transform;

    // Unmount (navigating away within the same browser tab) and remount.
    firstVisit.unmount();

    const secondVisit = render(
      <ModalsProvider>
        <PrototypeBoardPage boardId="pricing-board" />
      </ModalsProvider>
    );

    await waitFor(() => {
      const worldAfter = (
        secondVisit.container.querySelector(
          '.PrototypeCanvas__world'
        ) as HTMLElement
      )?.style.transform;
      expect(worldAfter).toBe(worldBefore);
    });
  });

  it('restores the user Root AI session when returning to the page until "New chat" is clicked', async () => {
    vi.mocked(apiGetPrototypeAiChat).mockResolvedValue({
      session: {
        chatId: 'proto-saved-session',
        modelId: 'claude-sonnet-5',
        messages: [
          {
            id: 'u1',
            role: 'user',
            parts: [{type: 'text', text: 'Create two hero options'}],
          },
          {
            id: 'a1',
            role: 'assistant',
            parts: [{type: 'text', text: 'Added Hero Option A and Option B.'}],
          },
        ],
        createdAt: 1700000000000,
        updatedAt: 1700000005000,
      },
    });

    const firstVisit = render(
      <ModalsProvider>
        <PrototypeBoardPage boardId="pricing-board" />
      </ModalsProvider>
    );

    await waitFor(() => {
      expect(firstVisit.getByLabelText('Edit with AI')).not.toBeNull();
    });

    fireEvent.click(firstVisit.getByLabelText('Edit with AI'));

    await waitFor(() => {
      expect(firstVisit.getByText('Create two hero options')).not.toBeNull();
      expect(
        firstVisit.getByText('Added Hero Option A and Option B.')
      ).not.toBeNull();
    });

    // Leave the page with Root AI open and return: panel & history both restore.
    firstVisit.unmount();

    const returnVisit = render(
      <ModalsProvider>
        <PrototypeBoardPage boardId="pricing-board" />
      </ModalsProvider>
    );

    await waitFor(() => {
      expect(returnVisit.getByText('Create two hero options')).not.toBeNull();
      expect(
        returnVisit.getByText('Added Hero Option A and Option B.')
      ).not.toBeNull();
    });

    // Clicking "New chat" clears the persisted session.
    vi.mocked(apiGetPrototypeAiChat).mockResolvedValue({session: null});
    fireEvent.click(returnVisit.getByLabelText('New chat'));

    await waitFor(() => {
      expect(apiClearPrototypeAiChat).toHaveBeenCalledWith('pricing-board');
      expect(returnVisit.getByText('Design with Root AI')).not.toBeNull();
    });
  });

  it('renames a frame inline and supports Cmd+Z / Cmd+Shift+Z canvas undo and redo', async () => {
    vi.mocked(apiSavePrototypeFrame).mockImplementation(async (input) => ({
      id: input.frame.id || 'frame-a',
      boardId: input.boardId,
      pageId: input.frame.pageId || 'page-1',
      title: input.frame.title || 'Pricing A',
      width: input.frame.width || 400,
      x: input.frame.x ?? 100,
      y: input.frame.y ?? 100,
      cachedHeight: 300,
      blocks: input.frame.blocks || {_array: []},
      createdAt: 1700000000000,
      createdBy: 'editor@example.com',
      updatedAt: 1700000009000,
      updatedBy: 'editor@example.com',
    }));

    const view = render(
      <ModalsProvider>
        <PrototypeBoardPage boardId="pricing-board" />
      </ModalsProvider>
    );

    await waitFor(() => {
      expect(view.getByText('Pricing A')).not.toBeNull();
    });

    // Double-click the frame header title to rename inline.
    fireEvent.dblClick(view.getByText('Pricing A'));
    const titleInput = view.getByLabelText('Frame title') as HTMLInputElement;
    expect(titleInput.value).toBe('Pricing A');

    fireEvent.input(titleInput, {target: {value: 'Pricing Enterprise'}});
    fireEvent.keyDown(titleInput, {key: 'Enter'});

    await waitFor(() => {
      expect(apiSavePrototypeFrame).toHaveBeenCalledWith({
        boardId: 'pricing-board',
        frame: {id: 'frame-a', title: 'Pricing Enterprise'},
      });
      expect(view.getByText('Pricing Enterprise')).not.toBeNull();
    });

    // Undo (Cmd+Z) restores "Pricing A".
    fireEvent.keyDown(window, {key: 'z', metaKey: true});
    await waitFor(() => {
      expect(view.getByText('Pricing A')).not.toBeNull();
      expect(apiSavePrototypeFrame).toHaveBeenLastCalledWith(
        expect.objectContaining({
          boardId: 'pricing-board',
          frame: expect.objectContaining({id: 'frame-a', title: 'Pricing A'}),
        })
      );
    });

    // Redo (Cmd+Shift+Z) reapplies "Pricing Enterprise".
    fireEvent.keyDown(window, {key: 'z', metaKey: true, shiftKey: true});
    await waitFor(() => {
      expect(view.getByText('Pricing Enterprise')).not.toBeNull();
      expect(apiSavePrototypeFrame).toHaveBeenLastCalledWith(
        expect.objectContaining({
          boardId: 'pricing-board',
          frame: expect.objectContaining({
            id: 'frame-a',
            title: 'Pricing Enterprise',
          }),
        })
      );
    });
  });

  it('steps between frames with ArrowRight/ArrowLeft and switches viewport width in full-screen preview', async () => {
    const view = render(
      <ModalsProvider>
        <PrototypeBoardPage boardId="pricing-board" />
      </ModalsProvider>
    );

    await waitFor(() => {
      expect(
        view.container.querySelector('[data-frame-id="frame-a"]')
      ).not.toBeNull();
    });

    const frameAEl = view.container.querySelector(
      '[data-frame-id="frame-a"]'
    ) as HTMLElement;
    const expandBtn = frameAEl.querySelector(
      'button[aria-label="Expand"]'
    ) as HTMLButtonElement;
    fireEvent.click(expandBtn);

    await waitFor(() => {
      expect(
        document.querySelector('.PrototypeBoardPage__fullscreenBar')
      ).not.toBeNull();
      expect(
        document.querySelector('.PrototypeBoardPage__fullscreenCounter')
          ?.textContent
      ).toContain('1 / 2');
    });

    // ArrowRight steps to the second frame ("Pricing B") on the active page.
    fireEvent.keyDown(window, {key: 'ArrowRight'});
    await waitFor(() => {
      expect(
        document.querySelector('.PrototypeBoardPage__fullscreenCounter')
          ?.textContent
      ).toContain('2 / 2');
      const iframe = document.querySelector(
        '.PrototypeBoardPage__fullscreenStage iframe'
      ) as HTMLIFrameElement;
      expect(iframe.getAttribute('title')).toBe('Pricing B');
      expect(window.location.search).toContain('frame=frame-b');
    });

    // Toggle viewport width between Tablet (768px) and Desktop (100%).
    const tabletBtn = document.querySelector(
      'button[aria-label="Tablet (768px)"]'
    ) as HTMLButtonElement;
    fireEvent.click(tabletBtn);
    const iframe = document.querySelector(
      '.PrototypeBoardPage__fullscreenStage iframe'
    ) as HTMLIFrameElement;
    expect(iframe.style.width).toBe('768px');

    const desktopBtn = document.querySelector(
      'button[aria-label="Desktop"]'
    ) as HTMLButtonElement;
    fireEvent.click(desktopBtn);
    expect(iframe.style.width).toBe('100%');
  });

  it('allows dragging a single selected frame by its body after marquee-selecting it', async () => {
    vi.mocked(apiSavePrototypeFrame).mockImplementation(async (input) => ({
      id: input.frame.id || 'frame-a',
      boardId: input.boardId,
      pageId: input.frame.pageId || 'page-1',
      title: input.frame.title || 'Pricing A',
      width: input.frame.width || 400,
      x: input.frame.x ?? 100,
      y: input.frame.y ?? 100,
      cachedHeight: 300,
      blocks: input.frame.blocks || {_array: []},
      createdAt: 1700000000000,
      createdBy: 'editor@example.com',
      updatedAt: 1700000009000,
      updatedBy: 'editor@example.com',
    }));

    const view = render(
      <ModalsProvider>
        <PrototypeBoardPage boardId="pricing-board" />
      </ModalsProvider>
    );

    await waitFor(() => {
      expect(
        view.container.querySelector('[data-frame-id="frame-a"]')
      ).not.toBeNull();
    });

    const canvas = view.container.querySelector(
      '.PrototypeCanvas'
    ) as HTMLElement;

    // Select only frame-a (middle-left band, avoiding label-1 above and note-1 below).
    fireEvent.pointerDown(canvas, {button: 0, clientX: 5, clientY: 280});
    fireEvent.pointerMove(window, {clientX: 280, clientY: 320});
    fireEvent.pointerUp(window, {clientX: 280, clientY: 320});

    const frameA = view.container.querySelector(
      '[data-frame-id="frame-a"]'
    ) as HTMLElement;
    const frameB = view.container.querySelector(
      '[data-frame-id="frame-b"]'
    ) as HTMLElement;
    const noteBtn = view.container.querySelector(
      '[data-annotation-id="note-1"] button'
    ) as HTMLElement;
    const labelBtn = view.container.querySelector(
      '[data-annotation-id="label-1"] button'
    ) as HTMLElement;
    expect(frameA.classList.contains('PrototypeFrame--selected')).toBe(true);
    expect(frameB.classList.contains('PrototypeFrame--selected')).toBe(false);
    expect(noteBtn.getAttribute('aria-pressed')).toBe('false');
    expect(labelBtn.getAttribute('aria-pressed')).toBe('false');

    // Drag frame-a by its body shield.
    const shield = frameA.querySelector(
      '.PrototypeFrame__shield'
    ) as HTMLElement;
    expect(shield.classList.contains('cursor-grab')).toBe(true);
    fireEvent.pointerDown(shield, {button: 0, clientX: 250, clientY: 220});
    fireEvent.pointerMove(window, {clientX: 350, clientY: 270});
    fireEvent.pointerUp(window, {clientX: 350, clientY: 270});

    await waitFor(() => {
      expect(apiSavePrototypeFrame).toHaveBeenCalledWith(
        expect.objectContaining({
          boardId: 'pricing-board',
          frame: expect.objectContaining({
            id: 'frame-a',
            x: expect.any(Number),
            y: expect.any(Number),
          }),
        })
      );
    });
    const saved = vi.mocked(apiSavePrototypeFrame).mock.calls[0][0].frame;
    expect(saved.x).toBeGreaterThan(150);
    expect(saved.y).toBeGreaterThan(120);
  });
});
