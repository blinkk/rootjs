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

import {DraftDocController} from './useDraftDoc.js';

/** Recursively collects paths whose value is literally `undefined`. */
function findUndefinedPaths(value: any, path = ''): string[] {
  const found: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      if (item === undefined) {
        found.push(`${path}[${i}]`);
      } else {
        found.push(...findUndefinedPaths(item, `${path}[${i}]`));
      }
    });
    return found;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (value[key] === undefined) {
        found.push(childPath);
      } else {
        found.push(...findUndefinedPaths(value[key], childPath));
      }
    }
  }
  return found;
}

describe('DraftDocController', () => {
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

  /**
   * Repro for the paste race: pasting an array item queues the full item
   * object in pendingUpdates. The same object reference is inserted into the
   * local JsonTrieStore, so a removeKey() on a nested key (e.g. removing an
   * item from a nested array of the pasted block, or a child field clearing
   * itself) used to set `undefined` *inside* the still-pending parent object.
   * At flush time the child update is dropped in favor of the pending parent,
   * and the parent was sent to Firestore containing a nested `undefined`,
   * which updateDoc() rejects.
   */
  it('flushes no nested undefined when a child key is removed while its parent is pending (paste race)', async () => {
    const controller = new DraftDocController('pages/index');

    // Simulate pasting an array item (DocEditor arrayReducer "pasteAfter").
    controller.updateKeys({
      'fields.blocks._array': ['a', 'new1'],
      'fields.blocks.new1': {
        title: 'Pasted block',
        items: {
          _array: ['k1', 'k2'],
          k1: {name: 'one'},
          k2: {name: 'two'},
        },
      },
    });

    // Within the save-debounce window, remove an item from the nested array
    // of the freshly-pasted block (arrayReducer "removeAt").
    controller.updateKeys({
      'fields.blocks.new1.items._array': ['k2'],
    });
    await controller.removeKey('fields.blocks.new1.items.k1');

    await controller.flush();

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const payload = updateDocMock.mock.calls[0][1] as Record<string, any>;
    expect(findUndefinedPaths(payload)).toEqual([]);

    // The pasted block should be written with the nested removal applied.
    const block = payload['fields.blocks.new1'];
    expect(block.items._array).toEqual(['k2']);
    expect('k1' in block.items).toBe(false);
    expect(block.items.k2).toEqual({name: 'two'});
  });

  it('removeKey() deletes the key from the local store data', async () => {
    const controller = new DraftDocController('pages/index');
    controller.updateKeys({
      'fields.blocks._array': ['a'],
      'fields.blocks.a': {title: 'Block A'},
    });
    await controller.removeKey('fields.blocks.a');

    const blocks = controller.getValue('fields.blocks');
    expect('a' in blocks).toBe(false);
    expect(findUndefinedPaths(controller.getData())).toEqual([]);
  });

  it('keeps top-level deleteField sentinels in the flush payload', async () => {
    const controller = new DraftDocController('pages/index');
    controller.updateKeys({
      'fields.blocks._array': [],
    });
    await controller.removeKey('fields.blocks.a');
    await controller.flush();

    const payload = updateDocMock.mock.calls[0][1] as Record<string, any>;
    expect(payload['fields.blocks.a']).toBeTruthy();
    expect(payload['fields.blocks.a']._methodName).toEqual('deleteField');
  });

  /**
   * Repro for the snapshot-echo race: when a remote snapshot arrives while a
   * removal is pending, the pending deleteField() sentinel used to be copied
   * into the local snapshot data verbatim (instead of deleting the key).
   * Subscribers then observed the sentinel object as field data, and any
   * flow that writes such an object back to Firestore would fail.
   */
  it('applies pending removals as deletions when merging a remote snapshot', async () => {
    const controller = new DraftDocController('pages/index');
    await controller.start();
    expect(onSnapshotMock).toHaveBeenCalledTimes(1);
    const snapshotCallback = onSnapshotMock.mock.calls[0][1] as (
      snapshot: any
    ) => void;

    // Local unsaved edits: paste a block, then cut (remove) block "b".
    controller.updateKeys({
      'fields.blocks._array': ['a', 'new1'],
      'fields.blocks.new1': {title: 'Pasted block'},
    });
    await controller.removeKey('fields.blocks.b');

    // A remote snapshot arrives before the local changes are flushed. The
    // server still has block "b".
    snapshotCallback({
      metadata: {hasPendingWrites: false},
      data: () => ({
        fields: {
          blocks: {
            _array: ['a', 'b'],
            a: {title: 'Block A'},
            b: {title: 'Block B'},
          },
        },
      }),
    });

    const blocks = controller.getValue('fields.blocks');
    // The local removal must be preserved as a deletion, not as a leaked
    // sentinel object (or undefined).
    expect('b' in blocks).toBe(false);
    // The local paste must be preserved.
    expect(blocks.new1).toEqual({title: 'Pasted block'});
    expect(blocks._array).toEqual(['a', 'new1']);
    expect(findUndefinedPaths(controller.getData())).toEqual([]);
  });

  it('prunes undefined values that callers pass inside objects', async () => {
    const controller = new DraftDocController('pages/index');
    // structuredClone() (used by the array "duplicate"/paste actions)
    // preserves undefined-valued properties, so guard against callers passing
    // such objects directly.
    controller.updateKey('fields.blocks.a', {
      title: 'Block A',
      subtitle: undefined,
      nested: {value: undefined, kept: 'yes'},
    });
    await controller.flush();

    const payload = updateDocMock.mock.calls[0][1] as Record<string, any>;
    expect(findUndefinedPaths(payload)).toEqual([]);
    expect(payload['fields.blocks.a'].nested.kept).toEqual('yes');
    expect('subtitle' in payload['fields.blocks.a']).toBe(false);
  });
});
