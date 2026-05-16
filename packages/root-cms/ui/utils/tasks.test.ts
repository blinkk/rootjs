import {describe, expect, it, vi} from 'vitest';

const mockProjectId = 'test-project-id';
window.__ROOT_CTX = {
  rootConfig: {projectId: mockProjectId},
} as any;
window.firebase = {
  db: {type: 'mock-db'},
  user: {email: 'tester@example.com'},
} as any;

vi.mock('firebase/firestore', () => ({
  arrayRemove: vi.fn(),
  arrayUnion: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  FieldPath: vi.fn(),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  Timestamp: {
    now: () => ({toMillis: () => 0}),
    fromDate: (d: Date) => ({toMillis: () => d.getTime(), toDate: () => d}),
  },
  updateDoc: vi.fn(),
}));

vi.mock('./actions.js', () => ({
  logAction: vi.fn(),
}));

describe('extractMentions', () => {
  it('extracts a single mention from a comment string', async () => {
    const {extractMentions} = await import('./tasks.js');
    expect(extractMentions('hi @foo@example.com please review')).toEqual([
      'foo@example.com',
    ]);
  });

  it('extracts multiple mentions and dedupes', async () => {
    const {extractMentions} = await import('./tasks.js');
    expect(
      extractMentions('@a@example.com @b@example.com again @A@example.com')
    ).toEqual(['a@example.com', 'b@example.com']);
  });

  it('returns an empty array when no mentions are present', async () => {
    const {extractMentions} = await import('./tasks.js');
    expect(extractMentions('no mentions in this comment')).toEqual([]);
  });

  it('extracts mentions from rich text data', async () => {
    const {extractMentions} = await import('./tasks.js');
    const data = {
      blocks: [
        {type: 'paragraph', data: {text: 'cc @user@test.com here'}},
        {type: 'paragraph', data: {text: 'and @other@test.com'}},
      ],
      time: 0,
      version: 'test',
    };
    expect(extractMentions(data as any)).toEqual([
      'user@test.com',
      'other@test.com',
    ]);
  });

  it('does not match emails without a leading @', async () => {
    const {extractMentions} = await import('./tasks.js');
    expect(extractMentions('email me at foo@example.com')).toEqual([]);
  });
});

describe('isUserSubscribedToTask', () => {
  it('returns true when the email is in subscribers', async () => {
    const {isUserSubscribedToTask} = await import('./tasks.js');
    const task = {
      id: '1',
      title: 'Test',
      createdAt: {toMillis: () => 0} as any,
      createdBy: 'a@example.com',
      subscribers: ['user@example.com'],
    };
    expect(isUserSubscribedToTask(task as any, 'user@example.com')).toBe(true);
    expect(isUserSubscribedToTask(task as any, 'USER@example.com')).toBe(true);
  });

  it('returns false when not subscribed', async () => {
    const {isUserSubscribedToTask} = await import('./tasks.js');
    const task = {
      id: '1',
      title: 'Test',
      createdAt: {toMillis: () => 0} as any,
      createdBy: 'a@example.com',
      subscribers: ['user@example.com'],
    };
    expect(isUserSubscribedToTask(task as any, 'other@example.com')).toBe(
      false
    );
  });
});
