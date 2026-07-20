import {beforeEach, describe, expect, it, vi} from 'vitest';

const {updateDocMock, onSnapshotMock} = vi.hoisted(() => ({
  updateDocMock: vi.fn(async () => {}),
  onSnapshotMock: vi.fn(() => () => {}),
}));

vi.mock('firebase/firestore', () => {
  /** Stand-in for the Firestore FieldValue sentinel base class. */
  class FieldValue {
    constructor(readonly _methodName: string) {}
  }
  class Timestamp {}
  const noop = vi.fn();
  return {
    FieldValue,
    Timestamp,
    doc: vi.fn(() => ({path: 'Projects/test/Collections/pages/Drafts/index'})),
    onSnapshot: onSnapshotMock,
    updateDoc: updateDocMock,
    serverTimestamp: () => new FieldValue('serverTimestamp'),
    deleteField: () => new FieldValue('deleteField'),
    arrayUnion: () => new FieldValue('arrayUnion'),
    collection: noop,
    getDoc: noop,
    getDocs: noop,
    setDoc: noop,
    deleteDoc: noop,
    runTransaction: noop,
    writeBatch: noop,
    documentId: noop,
    query: noop,
    where: noop,
    orderBy: noop,
    limit: noop,
    startAfter: noop,
    Query: class {},
    WriteBatch: class {},
    DocumentReference: class {},
    QueryDocumentSnapshot: class {},
    Firestore: class {},
  };
});

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

import {DraftDocController, DraftDocEventType} from './useDraftDoc.js';

describe('DraftDocController undo/redo history', () => {
  beforeEach(() => {
    updateDocMock.mockClear();
    onSnapshotMock.mockClear();
    (window as any).__ROOT_CTX = {
      rootConfig: {projectId: 'test-project'},
      collections: {},
    };
    (window as any).firebase = {
      db: {},
      user: {email: 'test@example.com'},
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({status: 200, text: async () => ''}))
    );
  });

  it('captures field edits and restores the before-value on undo', async () => {
    const controller = new DraftDocController('pages/index');
    controller.updateKey('fields.title', 'v1');
    // Coalescing merges rapid same-key edits, so this still forms one entry
    // with the original before-value (undefined).
    controller.updateKey('fields.title', 'v2');
    expect(controller.history.canUndo()).toBe(true);

    const result = controller.undo();
    expect(result.status).toEqual('applied');
    expect(controller.getValue('fields.title')).toBeUndefined();
    expect(controller.history.canUndo()).toBe(false);
    expect(controller.history.canRedo()).toBe(true);

    const redone = controller.redo();
    expect(redone.status).toEqual('applied');
    expect(controller.getValue('fields.title')).toEqual('v2');
  });

  it('does not capture sys.* writes', () => {
    const controller = new DraftDocController('pages/index');
    controller.updateKey('sys.locales', ['en', 'fr']);
    controller.updateKeys({'sys.publishingLocked': {reason: 'test'}});
    expect(controller.history.canUndo()).toBe(false);
  });

  it('does not capture or apply history in readOnly mode', () => {
    const controller = new DraftDocController('pages/index');
    controller.readOnly = true;
    controller.updateKey('fields.title', 'v1');
    expect(controller.history.canUndo()).toBe(false);
    expect(controller.undo().status).toEqual('empty');
  });

  it('flushes undo restores through the normal save path with deleteField sentinels', async () => {
    const controller = new DraftDocController('pages/index');
    controller.updateKeys({
      'fields.blocks._array': ['a'],
      'fields.blocks.a': {title: 'Block A'},
    });
    await controller.flush();
    updateDocMock.mockClear();

    const result = controller.undo();
    expect(result.status).toEqual('applied');
    await controller.flush();

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const payload = updateDocMock.mock.calls[0][1] as Record<string, any>;
    // Undoing the "add" removes both keys in Firestore.
    expect(payload['fields.blocks._array']._methodName).toEqual('deleteField');
    expect(payload['fields.blocks.a']._methodName).toEqual('deleteField');
    // And the local store no longer contains the keys.
    const blocks = controller.getValue('fields.blocks');
    expect('a' in blocks).toBe(false);
    expect('_array' in blocks).toBe(false);
  });

  it('round-trips an atomic array removal (order + item) as one entry', () => {
    const controller = new DraftDocController('pages/index');
    controller.updateKeys({
      'fields.blocks._array': ['a', 'b'],
      'fields.blocks.a': {title: 'Block A'},
      'fields.blocks.b': {title: 'Block B'},
    });

    // Atomic removal of item "a" (mirrors the arrayReducer removeAt shape).
    controller.updateKeys({
      'fields.blocks._array': ['b'],
      'fields.blocks.a': undefined,
    });
    expect(controller.getValue('fields.blocks.a')).toBeUndefined();

    const result = controller.undo();
    expect(result.status).toEqual('applied');
    expect(controller.getValue('fields.blocks._array')).toEqual(['a', 'b']);
    expect(controller.getValue('fields.blocks.a')).toEqual({title: 'Block A'});

    const redone = controller.redo();
    expect(redone.status).toEqual('applied');
    expect(controller.getValue('fields.blocks._array')).toEqual(['b']);
    expect(controller.getValue('fields.blocks.a')).toBeUndefined();
  });

  it('dispatches HISTORY_APPLIED with the written keys', () => {
    const controller = new DraftDocController('pages/index');
    const applied: string[][] = [];
    controller.on(DraftDocEventType.HISTORY_APPLIED, (keys: string[]) => {
      applied.push(keys);
    });
    controller.updateKeys({
      'fields.blocks._array': ['a'],
      'fields.blocks.a': {title: 'A'},
    });
    controller.undo();
    expect(applied.length).toEqual(1);
    expect(applied[0].sort()).toEqual([
      'fields.blocks._array',
      'fields.blocks.a',
    ]);
  });

  it('prunes stale entries when a remote snapshot changes captured fields', async () => {
    const controller = new DraftDocController('pages/index');
    await controller.start();
    const snapshotCallback = onSnapshotMock.mock.calls[0][1] as (
      snapshot: any
    ) => void;

    controller.updateKey('fields.title', 'local');
    await controller.flush();
    expect(controller.history.canUndo()).toBe(true);

    // Another editor overwrites the field after our write committed.
    snapshotCallback({
      metadata: {hasPendingWrites: false},
      data: () => ({fields: {title: 'remote'}}),
    });
    expect(controller.getValue('fields.title')).toEqual('remote');
    expect(controller.history.canUndo()).toBe(false);
  });

  it('keeps entries when a snapshot merges with unflushed local edits', async () => {
    const controller = new DraftDocController('pages/index');
    await controller.start();
    const snapshotCallback = onSnapshotMock.mock.calls[0][1] as (
      snapshot: any
    ) => void;

    // Local edit is still pending (not flushed).
    controller.updateKey('fields.title', 'local');
    expect(controller.history.canUndo()).toBe(true);

    // A snapshot arrives with the server's older value; the pending local
    // update is re-applied on top, so the entry remains valid.
    snapshotCallback({
      metadata: {hasPendingWrites: false},
      data: () => ({fields: {title: 'server'}}),
    });
    expect(controller.getValue('fields.title')).toEqual('local');
    expect(controller.history.canUndo()).toBe(true);
  });

  it('undo with onlyEntryId is a no-op unless that entry is on top', () => {
    const controller = new DraftDocController('pages/index');
    controller.updateKey('fields.a', 1);
    const entryId = controller.history.peekUndo()!.id;

    // A newer edit to a different key pushes a new entry on top.
    controller.updateKey('fields.b', 2);
    const result = controller.undo({onlyEntryId: entryId});
    expect(result.status).toEqual('empty');
    expect(controller.getValue('fields.a')).toEqual(1);
    expect(controller.getValue('fields.b')).toEqual(2);

    // With the matching top entry, the scoped undo applies.
    const undoB = controller.undo({
      onlyEntryId: controller.history.peekUndo()!.id,
    });
    expect(undoB.status).toEqual('applied');
    expect(controller.getValue('fields.b')).toBeUndefined();
  });

  it('captures group() compound operations as a single entry', () => {
    const controller = new DraftDocController('pages/index');
    controller.updateKeys({
      'fields.blocks._array': ['a', 'b'],
      'fields.blocks.a': {title: 'A'},
      'fields.blocks.b': {title: 'B'},
    });

    // Simulates a cut+paste (move) of item "a" to a new key.
    controller.history.group('Move item', () => {
      controller.updateKeys({
        'fields.blocks._array': ['b', 'a2'],
        'fields.blocks.a2': {title: 'A'},
        'fields.blocks.a': undefined,
      });
    });

    const result = controller.undo();
    expect(result.status).toEqual('applied');
    expect(result.status === 'applied' && result.entry.label).toEqual(
      'Move item'
    );
    expect(controller.getValue('fields.blocks._array')).toEqual(['a', 'b']);
    expect(controller.getValue('fields.blocks.a')).toEqual({title: 'A'});
    expect(controller.getValue('fields.blocks.a2')).toBeUndefined();
  });
});
