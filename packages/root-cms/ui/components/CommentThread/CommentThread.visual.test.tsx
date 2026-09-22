import '../../styles/global.css';
import '../../styles/theme.css';

import {MantineProvider} from '@mantine/core';
import {cleanup, render, screen, waitFor} from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
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
import {FieldCommentThread} from '../../../shared/comments.js';
import * as comments from '../../utils/comments.js';
import {CommentThread} from './CommentThread.js';

const fieldCommentsCtx = {
  docId: 'Pages/foo',
  threads: [] as FieldCommentThread[],
  threadsByFieldKey: new Map<string, FieldCommentThread>(),
  openCount: 0,
  loading: false,
  canComment: true,
};

vi.mock('../../hooks/useFieldComments.js', async () => {
  const actual = await vi.importActual<any>('../../hooks/useFieldComments.js');
  return {
    ...actual,
    useFieldComments: () => fieldCommentsCtx,
  };
});

vi.mock('../../hooks/useProjectUsers.js', () => ({
  useProjectUsers: () => ({
    loading: false,
    users: [{email: 'alex@example.com', displayName: 'Alex Example'}],
  }),
}));

vi.mock('../../hooks/useUserProfile.js', () => ({
  useUserProfile: () => ({profile: null, loading: false}),
  useUserProfiles: () => ({profiles: new Map(), loading: false}),
  useAllUserProfiles: () => ({profiles: [], loading: false}),
}));

vi.mock('../../utils/comments.js', () => ({
  addFieldComment: vi.fn(async () => ({threadId: 't', commentId: 'c'})),
  editFieldComment: vi.fn(async () => {}),
  deleteFieldComment: vi.fn(async () => {}),
  resolveFieldCommentThread: vi.fn(async () => {}),
  reopenFieldCommentThread: vi.fn(async () => {}),
  subscribeFieldCommentThreads: vi.fn(() => () => {}),
}));

// Globals are restored after the run so other test files aren't affected.
const originalRootCtx = window.__ROOT_CTX;
const originalFirebase = window.firebase;

beforeAll(() => {
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

function ts(millis: number) {
  return {toMillis: () => millis, toDate: () => new Date(millis)};
}

const THREAD: FieldCommentThread = {
  id: 'fields.hero.title',
  docId: 'Pages/foo',
  fieldKey: 'fields.hero.title',
  fieldLabel: 'Hero › Title',
  status: 'open',
  participants: ['me@example.com', 'alex@example.com'],
  createdAt: ts(1),
  createdBy: 'me@example.com',
  comments: [
    {
      id: 'c1',
      type: 'comment',
      content: 'Can we shorten this? cc @Alex Example',
      body: {
        version: '1',
        time: 1,
        blocks: [
          {
            type: 'paragraph',
            data: {
              text: 'Can we shorten this? cc <a href="mailto:alex@example.com" data-mention="alex@example.com">@Alex Example</a>',
            },
          },
        ],
      },
      mentions: ['alex@example.com'],
      createdAt: ts(1),
      createdBy: 'me@example.com',
    },
    {
      id: 'c2',
      type: 'comment',
      content: 'Sure, on it.',
      body: {
        version: '1',
        time: 2,
        blocks: [{type: 'paragraph', data: {text: 'Sure, on it.'}}],
      },
      createdAt: ts(2),
      createdBy: 'alex@example.com',
    },
  ],
};

beforeEach(() => {
  fieldCommentsCtx.canComment = true;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CommentThread', () => {
  it('renders the thread history with mentions and a composer', () => {
    render(
      <MantineProvider>
        <div style={{width: '380px', padding: '20px'}}>
          <CommentThread
            docId="Pages/foo"
            fieldKey="fields.hero.title"
            fieldLabel="Hero › Title"
            thread={THREAD}
          />
        </div>
      </MantineProvider>
    );
    expect(screen.getByText('Hero › Title')).toBeTruthy();
    expect(screen.getByText('Sure, on it.')).toBeTruthy();
    const mention = document.querySelector('.CommentBody__mention');
    expect(mention?.textContent).toBe('@Alex Example');
    // Only the current user's comment exposes edit/delete controls.
    expect(screen.getAllByRole('button', {name: 'Edit comment'})).toHaveLength(
      1
    );
    expect(screen.getByRole('button', {name: 'Mark as resolved'})).toBeTruthy();
    expect(screen.getByRole('button', {name: 'Add comment'})).toBeTruthy();
  });

  it('resolves and reopens the thread', async () => {
    const user = userEvent.setup();
    const {rerender} = render(
      <MantineProvider>
        <CommentThread
          docId="Pages/foo"
          fieldKey="fields.hero.title"
          fieldLabel="Hero › Title"
          thread={THREAD}
        />
      </MantineProvider>
    );
    await user.click(screen.getByRole('button', {name: 'Mark as resolved'}));
    expect(comments.resolveFieldCommentThread).toHaveBeenCalledWith(
      'Pages/foo',
      'fields.hero.title'
    );

    rerender(
      <MantineProvider>
        <CommentThread
          docId="Pages/foo"
          fieldKey="fields.hero.title"
          fieldLabel="Hero › Title"
          thread={{...THREAD, status: 'resolved'}}
        />
      </MantineProvider>
    );
    expect(screen.getByText('Resolved')).toBeTruthy();
    await user.click(screen.getByRole('button', {name: 'Reopen thread'}));
    expect(comments.reopenFieldCommentThread).toHaveBeenCalledWith(
      'Pages/foo',
      'fields.hero.title'
    );
  });

  it('submits a new comment with Cmd+Enter', async () => {
    const user = userEvent.setup();
    const onCommentAdded = vi.fn();
    render(
      <MantineProvider>
        <CommentThread
          docId="Pages/foo"
          fieldKey="fields.hero.title"
          fieldLabel="Hero › Title"
          thread={null}
          onCommentAdded={onCommentAdded}
        />
      </MantineProvider>
    );
    const editor = document.querySelector<HTMLElement>(
      '.LexicalEditor__editor'
    )!;
    await user.click(editor);
    await user.keyboard('Looks good to me');
    await waitFor(() => {
      expect(
        screen
          .getByRole('button', {name: 'Add comment'})
          .hasAttribute('disabled')
      ).toBe(false);
    });
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    await waitFor(() => {
      expect(comments.addFieldComment).toHaveBeenCalledTimes(1);
    });
    const [docId, options] = vi.mocked(comments.addFieldComment).mock
      .calls[0] as any;
    expect(docId).toBe('Pages/foo');
    expect(options.fieldKey).toBe('fields.hero.title');
    expect(options.fieldLabel).toBe('Hero › Title');
    expect((options.body.blocks[0] as any).data.text).toContain(
      'Looks good to me'
    );
    expect(onCommentAdded).toHaveBeenCalled();
  });

  it('hides the composer and controls for read-only users', () => {
    fieldCommentsCtx.canComment = false;
    render(
      <MantineProvider>
        <CommentThread
          docId="Pages/foo"
          fieldKey="fields.hero.title"
          fieldLabel="Hero › Title"
          thread={THREAD}
        />
      </MantineProvider>
    );
    expect(screen.queryByRole('button', {name: 'Add comment'})).toBeNull();
    expect(screen.queryByRole('button', {name: 'Mark as resolved'})).toBeNull();
    expect(screen.getByText('Sure, on it.')).toBeTruthy();
  });
});
