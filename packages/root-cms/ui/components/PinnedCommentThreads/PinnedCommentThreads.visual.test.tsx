import '../../styles/global.css';
import '../../styles/theme.css';

import {MantineProvider} from '@mantine/core';
import {act, cleanup, render, screen, waitFor} from '@testing-library/preact';
import {LocationProvider} from 'preact-iso';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {page} from 'vitest/browser';
import {FieldCommentThread} from '../../../shared/comments.js';
import {
  PinnedCommentThreadsContext,
  PinnedCommentThreadsProvider,
  usePinnedCommentThreads,
} from '../../hooks/usePinnedCommentThreads.js';
import {PinnedCommentThreads} from './PinnedCommentThreads.js';

function ts(millis: number) {
  return {toMillis: () => millis, toDate: () => new Date(millis)};
}

const THREAD: FieldCommentThread = {
  id: 'fields.hero.title',
  docId: 'Pages/foo',
  fieldKey: 'fields.hero.title',
  fieldLabel: 'Hero › Title',
  status: 'open',
  participants: ['me@example.com'],
  createdAt: ts(1),
  createdBy: 'me@example.com',
  comments: [
    {
      id: 'c1',
      type: 'comment',
      content: 'Can we shorten this?',
      body: {
        version: '1',
        time: 1,
        blocks: [{type: 'paragraph', data: {text: 'Can we shorten this?'}}],
      },
      createdAt: ts(1),
      createdBy: 'me@example.com',
    },
  ],
};

vi.mock('../../utils/comments.js', () => ({
  addFieldComment: vi.fn(async () => ({threadId: 't', commentId: 'c'})),
  editFieldComment: vi.fn(async () => {}),
  deleteFieldComment: vi.fn(async () => {}),
  resolveFieldCommentThread: vi.fn(async () => {}),
  reopenFieldCommentThread: vi.fn(async () => {}),
  subscribeFieldCommentThreads: vi.fn((_docId: string, onNext: any) => {
    onNext([THREAD]);
    return () => {};
  }),
}));

vi.mock('../../hooks/useProjectRoles.js', () => ({
  fetchProjectRoles: async () => ({}),
  useProjectRoles: () => ({roles: {}, loading: false}),
}));

vi.mock('../../utils/permissions.js', async () => {
  const actual = await vi.importActual<any>('../../utils/permissions.js');
  return {...actual, testCanEdit: () => true};
});

vi.mock('../../hooks/useProjectUsers.js', () => ({
  useProjectUsers: () => ({loading: false, users: []}),
}));

vi.mock('../../hooks/useUserProfile.js', () => ({
  useUserProfile: () => ({profile: null, loading: false}),
  useUserProfiles: () => ({profiles: new Map(), loading: false}),
  useAllUserProfiles: () => ({profiles: [], loading: false}),
}));

// Globals are restored after the run so other test files aren't affected.
const originalRootCtx = window.__ROOT_CTX;
const originalFirebase = window.firebase;

beforeAll(async () => {
  // Pinned windows are clamped to the viewport, so use a desktop-sized one.
  await page.viewport(1280, 800);
  window.__ROOT_CTX = {
    experiments: {},
    rootConfig: {projectId: 'test-project'},
  } as any;
  window.firebase = {user: {email: 'me@example.com'}} as any;
});

afterAll(() => {
  window.__ROOT_CTX = originalRootCtx;
  window.firebase = originalFirebase;
});

const STORAGE_KEY = 'root::PinnedCommentThreads';

let pinnedCtx: PinnedCommentThreadsContext;

function CaptureContext() {
  pinnedCtx = usePinnedCommentThreads()!;
  return null;
}

function renderPinned() {
  return render(
    <MantineProvider>
      <LocationProvider>
        <PinnedCommentThreadsProvider>
          <CaptureContext />
          <PinnedCommentThreads />
        </PinnedCommentThreadsProvider>
      </LocationProvider>
    </MantineProvider>
  );
}

function getWindow(label = 'Hero › Title') {
  return screen.getByRole('dialog', {name: `Comments: ${label}`});
}

function pointer(type: string, target: EventTarget, x: number, y: number) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 1,
      clientX: x,
      clientY: y,
    })
  );
}

beforeEach(() => {
  window.sessionStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.sessionStorage.removeItem(STORAGE_KEY);
});

describe('PinnedCommentThreads', () => {
  it('renders nothing when no threads are pinned', () => {
    renderPinned();
    expect(document.querySelector('.PinnedCommentThreads')).toBeNull();
  });

  it('renders a pinned thread in a fixed window', async () => {
    renderPinned();
    act(() => {
      pinnedCtx.pin({
        docId: 'Pages/foo',
        fieldKey: 'fields.hero.title',
        fieldLabel: 'Hero › Title',
        x: 100,
        y: 120,
      });
    });
    const win = getWindow();
    expect(win.style.left).toBe('100px');
    expect(win.style.top).toBe('120px');
    expect(getComputedStyle(win.parentElement!).position).toBe('fixed');
    expect(screen.getByText('Pages/foo')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('Can we shorten this?')).toBeTruthy();
    });
    expect(screen.getByRole('button', {name: 'Add comment'})).toBeTruthy();
  });

  it('moves the window by dragging its title bar', async () => {
    renderPinned();
    act(() => {
      pinnedCtx.pin({
        docId: 'Pages/foo',
        fieldKey: 'fields.hero.title',
        fieldLabel: 'Hero › Title',
        x: 100,
        y: 120,
      });
    });
    const win = getWindow();
    const titleBar = win.querySelector(
      '.PinnedCommentThreads__window__titleBar'
    )!;
    act(() => {
      pointer('pointerdown', titleBar, 110, 130);
      pointer('pointermove', window, 160, 200);
    });
    expect(win.style.left).toBe('150px');
    expect(win.style.top).toBe('190px');
    act(() => {
      pointer('pointerup', window, 160, 200);
    });
    expect(pinnedCtx.pinned[0]).toMatchObject({x: 150, y: 190});
    await waitFor(() => {
      const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY)!);
      expect(stored[0]).toMatchObject({x: 150, y: 190});
    });

    // Dragging is clamped to the viewport.
    act(() => {
      pointer('pointerdown', titleBar, 160, 200);
      pointer('pointermove', window, -500, -500);
      pointer('pointerup', window, -500, -500);
    });
    expect(win.style.left).toBe('8px');
    expect(win.style.top).toBe('8px');
  });

  it('moves the window with the arrow keys', () => {
    renderPinned();
    act(() => {
      pinnedCtx.pin({
        docId: 'Pages/foo',
        fieldKey: 'fields.hero.title',
        fieldLabel: 'Hero › Title',
        x: 100,
        y: 120,
      });
    });
    const handle = screen.getByRole('button', {
      name: 'Move comment window (use arrow keys)',
    });
    act(() => {
      handle.dispatchEvent(
        new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true})
      );
      handle.dispatchEvent(
        new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true})
      );
    });
    expect(getWindow().style.left).toBe('116px');
    expect(getWindow().style.top).toBe('136px');
  });

  it('brings a focused window to the front', () => {
    renderPinned();
    act(() => {
      pinnedCtx.pin({
        docId: 'Pages/foo',
        fieldKey: 'fields.hero.title',
        fieldLabel: 'Hero › Title',
        x: 100,
        y: 120,
      });
      pinnedCtx.pin({
        docId: 'Pages/foo',
        fieldKey: 'fields.hero.body',
        fieldLabel: 'Hero › Body',
        x: 140,
        y: 160,
      });
    });
    const title = getWindow('Hero › Title');
    const body = getWindow('Hero › Body');
    expect(Number(body.style.zIndex)).toBeGreaterThan(
      Number(title.style.zIndex)
    );
    act(() => {
      pinnedCtx.focus('Pages/foo', 'fields.hero.title');
    });
    expect(Number(title.style.zIndex)).toBeGreaterThan(
      Number(body.style.zIndex)
    );
    expect(title.classList).toContain('PinnedCommentThreads__window--flash');
  });

  it('unpins the thread when closed', async () => {
    renderPinned();
    act(() => {
      pinnedCtx.pin({
        docId: 'Pages/foo',
        fieldKey: 'fields.hero.title',
        fieldLabel: 'Hero › Title',
        x: 100,
        y: 120,
      });
    });
    act(() => {
      screen.getByRole('button', {name: 'Unpin'}).click();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => {
      expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  it('restores pinned threads from session storage', () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          docId: 'Pages/foo',
          fieldKey: 'fields.hero.title',
          fieldLabel: 'Hero › Title',
          x: 60,
          y: 80,
        },
      ])
    );
    renderPinned();
    expect(getWindow().style.left).toBe('60px');
    expect(getWindow().style.top).toBe('80px');
  });
});
