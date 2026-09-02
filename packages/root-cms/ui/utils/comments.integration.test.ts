// @vitest-environment node
import {deleteApp, FirebaseApp, initializeApp} from 'firebase/app';
import {
  connectFirestoreEmulator,
  doc,
  Firestore,
  getDoc,
  getDocs,
  getFirestore,
  collection,
} from 'firebase/firestore';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {fieldKeyToThreadId, FieldCommentThread} from '../../shared/comments.js';
import {RichTextData} from '../../shared/richtext.js';

vi.mock('./actions.js', () => ({
  logAction: vi.fn(async () => {}),
}));

import {logAction} from './actions.js';
import {
  addFieldComment,
  deleteFieldComment,
  editFieldComment,
  reopenFieldCommentThread,
  resolveFieldCommentThread,
} from './comments.js';

const PROJECT_ID = 'demo-field-comments';
const DOC_ID = 'Pages/foo';

function richText(text: string): RichTextData {
  return {
    version: '1',
    time: Date.now(),
    blocks: [{type: 'paragraph', data: {text}}],
  };
}

function setUser(email: string) {
  (globalThis as any).window.firebase.user = {email};
}

async function listThreads(db: Firestore): Promise<FieldCommentThread[]> {
  const snapshot = await getDocs(
    collection(
      db,
      'Projects',
      PROJECT_ID,
      'Collections',
      'Pages',
      'Drafts',
      'foo',
      'Comments'
    )
  );
  return snapshot.docs.map(
    (d) => ({...d.data(), id: d.id}) as FieldCommentThread
  );
}

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  'field comments (firestore emulator)',
  () => {
    let app: FirebaseApp;
    let db: Firestore;
    let counter = 0;

    beforeAll(() => {
      const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '').split(
        ':'
      );
      app = initializeApp({projectId: PROJECT_ID}, 'field-comments-test');
      db = getFirestore(app);
      connectFirestoreEmulator(db, host || 'localhost', Number(port) || 8080);
      (globalThis as any).window = {
        firebase: {db, user: {email: 'alice@example.com'}},
        __ROOT_CTX: {rootConfig: {projectId: PROJECT_ID}},
      };
    });

    afterAll(async () => {
      await deleteApp(app);
    });

    // Each test uses its own field so the emulator needs no clearing.
    let fieldKey = '';
    beforeEach(() => {
      counter += 1;
      fieldKey = `fields.sections.item${counter}.title`;
      setUser('alice@example.com');
      vi.mocked(logAction).mockClear();
    });

    it('starts a thread at the deterministic id and appends to it', async () => {
      const first = await addFieldComment(DOC_ID, {
        fieldKey,
        fieldLabel: 'Title',
        body: richText('First'),
      });
      expect(first.threadId).toBe(await fieldKeyToThreadId(fieldKey));

      setUser('bob@example.com');
      const second = await addFieldComment(DOC_ID, {
        fieldKey,
        body: richText(
          'Second <a href="mailto:carol@example.com" data-mention="carol@example.com">@Carol</a>'
        ),
      });
      expect(second.threadId).toBe(first.threadId);

      const threads = (await listThreads(db)).filter(
        (t) => t.fieldKey === fieldKey
      );
      expect(threads).toHaveLength(1);
      const thread = threads[0];
      expect(thread.status).toBe('open');
      expect(thread.fieldLabel).toBe('Title');
      expect(thread.comments.map((c) => c.content)).toEqual([
        'First',
        'Second @Carol',
      ]);
      expect(thread.comments[1].mentions).toEqual(['carol@example.com']);
      expect(thread.participants).toEqual([
        'alice@example.com',
        'bob@example.com',
      ]);
      expect(vi.mocked(logAction).mock.calls.map((c) => c[0])).toEqual([
        'doc.comment.add',
        'doc.comment.add',
      ]);
    });

    it('archives on resolve and starts a fresh thread on the next comment', async () => {
      const {threadId} = await addFieldComment(DOC_ID, {
        fieldKey,
        body: richText('Launch A feedback'),
      });
      const archivedId = await resolveFieldCommentThread(DOC_ID, threadId);
      expect(archivedId).toMatch(new RegExp(`^${threadId}-\\d+$`));

      // The open id is free again and the archived copy holds the history.
      expect(
        (
          await getDoc(
            doc(
              db,
              'Projects',
              PROJECT_ID,
              'Collections',
              'Pages',
              'Drafts',
              'foo',
              'Comments',
              threadId
            )
          )
        ).exists()
      ).toBe(false);
      let threads = (await listThreads(db)).filter(
        (t) => t.fieldKey === fieldKey
      );
      expect(threads.map((t) => [t.id, t.status])).toEqual([
        [archivedId, 'resolved'],
      ]);
      expect(threads[0].comments.map((c) => c.type)).toEqual([
        'comment',
        'resolved',
      ]);
      expect(threads[0].resolvedBy).toBe('alice@example.com');

      const next = await addFieldComment(DOC_ID, {
        fieldKey,
        body: richText('Launch B feedback'),
      });
      expect(next.threadId).toBe(threadId);
      threads = (await listThreads(db)).filter((t) => t.fieldKey === fieldKey);
      expect(threads).toHaveLength(2);
      const open = threads.find((t) => t.status === 'open')!;
      expect(open.id).toBe(threadId);
      expect(open.comments.map((c) => c.content)).toEqual([
        'Launch B feedback',
      ]);
      expect(open.participants).toEqual(['alice@example.com']);

      // Resolving again is idempotent on an already-resolved id.
      expect(await resolveFieldCommentThread(DOC_ID, archivedId)).toBe(
        archivedId
      );
      expect(vi.mocked(logAction).mock.calls.map((c) => c[0])).toEqual([
        'doc.comment.add',
        'doc.comment.resolve',
        'doc.comment.add',
      ]);
    });

    it('reopens an archived thread only when the field has no open thread', async () => {
      const {threadId} = await addFieldComment(DOC_ID, {
        fieldKey,
        body: richText('Old'),
      });
      const archivedId = await resolveFieldCommentThread(DOC_ID, threadId);
      await addFieldComment(DOC_ID, {fieldKey, body: richText('New')});

      await expect(
        reopenFieldCommentThread(DOC_ID, archivedId)
      ).rejects.toThrow(/already has an open thread/);

      // Resolve the new thread, then the old one can come back.
      const newArchivedId = await resolveFieldCommentThread(DOC_ID, threadId);
      setUser('bob@example.com');
      expect(await reopenFieldCommentThread(DOC_ID, archivedId)).toBe(threadId);
      const threads = (await listThreads(db)).filter(
        (t) => t.fieldKey === fieldKey
      );
      expect(threads.map((t) => [t.id, t.status]).sort()).toEqual(
        [
          [threadId, 'open'],
          [newArchivedId, 'resolved'],
        ].sort()
      );
      const reopened = threads.find((t) => t.id === threadId)!;
      expect(reopened.comments.map((c) => c.type)).toEqual([
        'comment',
        'resolved',
        'reopened',
      ]);
      expect(reopened.comments.at(-1)?.createdBy).toBe('bob@example.com');
      expect(reopened.resolvedAt).toBeNull();
      expect(vi.mocked(logAction).mock.lastCall?.[0]).toBe(
        'doc.comment.reopen'
      );
    });

    it('lets only the author edit or delete, and removes an emptied thread', async () => {
      const {threadId, commentId} = await addFieldComment(DOC_ID, {
        fieldKey,
        body: richText('Typo hear'),
      });
      setUser('bob@example.com');
      await expect(
        editFieldComment(DOC_ID, threadId, commentId, richText('x'))
      ).rejects.toThrow(/only the author/);
      await expect(
        deleteFieldComment(DOC_ID, threadId, commentId)
      ).rejects.toThrow(/only the author/);

      setUser('alice@example.com');
      await editFieldComment(
        DOC_ID,
        threadId,
        commentId,
        richText('Typo here')
      );
      let threads = (await listThreads(db)).filter(
        (t) => t.fieldKey === fieldKey
      );
      expect(threads[0].comments[0].content).toBe('Typo here');
      expect(threads[0].comments[0].updatedBy).toBe('alice@example.com');

      // Deleting the only comment removes the thread entirely.
      await deleteFieldComment(DOC_ID, threadId, commentId);
      threads = (await listThreads(db)).filter((t) => t.fieldKey === fieldKey);
      expect(threads).toHaveLength(0);
    });

    it('keeps a deleted placeholder when other comments remain', async () => {
      const {threadId, commentId} = await addFieldComment(DOC_ID, {
        fieldKey,
        body: richText('One'),
      });
      await addFieldComment(DOC_ID, {fieldKey, body: richText('Two')});
      await deleteFieldComment(DOC_ID, threadId, commentId);
      const threads = (await listThreads(db)).filter(
        (t) => t.fieldKey === fieldKey
      );
      expect(
        threads[0].comments.map((c) => [c.deleted || false, c.content])
      ).toEqual([
        [true, ''],
        [false, 'Two'],
      ]);
    });
  }
);
