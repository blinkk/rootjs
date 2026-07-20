import {describe, expect, it} from 'vitest';
import {
  EditHistory,
  bumpRichTextTimes,
  clonePreservingNonPlain,
} from './edit-history.js';

/**
 * Minimal stand-in for the draft doc store: a flat map of deepkey -> value
 * that mirrors applied updates, the way DraftDocController.updateKeys()
 * would.
 */
function createStore(initial?: Record<string, any>) {
  const values = new Map<string, any>(Object.entries(initial || {}));
  return {
    get: (key: string) => values.get(key),
    set: (key: string, value: any) => {
      if (value === undefined) {
        values.delete(key);
      } else {
        values.set(key, value);
      }
    },
    applyUpdates: (updates: Record<string, any>) => {
      for (const key of Object.keys(updates)) {
        if (updates[key] === undefined) {
          values.delete(key);
        } else {
          values.set(key, updates[key]);
        }
      }
    },
  };
}

function createHistory(options?: {maxEntries?: number}) {
  let time = 1000;
  const history = new EditHistory({
    maxEntries: options?.maxEntries,
    coalesceWindowMs: 1000,
    now: () => time,
  });
  return {
    history,
    tick: (ms: number) => {
      time += ms;
    },
    getTime: () => time,
  };
}

describe('EditHistory', () => {
  it('round-trips a single field edit through undo and redo', () => {
    const {history} = createHistory();
    const store = createStore({'fields.title': 'v1'});

    store.set('fields.title', 'v2');
    history.capture({'fields.title': {before: 'v1', after: 'v2'}});
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    const undone = history.undo(store.get);
    expect(undone.status).toEqual('applied');
    if (undone.status === 'applied') {
      expect(undone.updates).toEqual({'fields.title': 'v1'});
      store.applyUpdates(undone.updates);
    }
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);

    const redone = history.redo(store.get);
    expect(redone.status).toEqual('applied');
    if (redone.status === 'applied') {
      expect(redone.updates).toEqual({'fields.title': 'v2'});
      store.applyUpdates(redone.updates);
    }
    expect(store.get('fields.title')).toEqual('v2');
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it('undoing an added key restores it to undefined (removed)', () => {
    const {history} = createHistory();
    const store = createStore();

    store.set('fields.image', {src: 'a.png'});
    history.capture({
      'fields.image': {before: undefined, after: {src: 'a.png'}},
    });

    const undone = history.undo(store.get);
    expect(undone.status).toEqual('applied');
    if (undone.status === 'applied') {
      expect('fields.image' in undone.updates).toBe(true);
      expect(undone.updates['fields.image']).toBeUndefined();
      store.applyUpdates(undone.updates);
    }
    expect(store.get('fields.image')).toBeUndefined();
  });

  it('clears the redo stack when a new capture arrives', () => {
    const {history, tick} = createHistory();
    const store = createStore({'fields.title': 'v1'});

    store.set('fields.title', 'v2');
    history.capture({'fields.title': {before: 'v1', after: 'v2'}});
    const undone = history.undo(store.get);
    if (undone.status === 'applied') {
      store.applyUpdates(undone.updates);
    }
    expect(history.canRedo()).toBe(true);

    tick(5000);
    store.set('fields.desc', 'hello');
    history.capture({'fields.desc': {before: undefined, after: 'hello'}});
    expect(history.canRedo()).toBe(false);
  });

  it('skips captures where before and after are deep-equal', () => {
    const {history} = createHistory();
    history.capture({
      'fields.obj': {before: {a: 1, b: [2]}, after: {a: 1, b: [2]}},
    });
    expect(history.canUndo()).toBe(false);
  });

  describe('coalescing', () => {
    it('merges rapid same-key captures into one entry', () => {
      const {history, tick} = createHistory();
      const store = createStore({'fields.title': 'abc'});

      history.capture({'fields.title': {before: '', after: 'a'}});
      tick(100);
      history.capture({'fields.title': {before: 'a', after: 'ab'}});
      tick(100);
      history.capture({'fields.title': {before: 'ab', after: 'abc'}});

      const undone = history.undo(store.get);
      expect(undone.status).toEqual('applied');
      if (undone.status === 'applied') {
        expect(undone.updates).toEqual({'fields.title': ''});
      }
      expect(history.canUndo()).toBe(false);
    });

    it('does not merge captures for different keys', () => {
      const {history, tick} = createHistory();
      history.capture({'fields.title': {before: '', after: 'a'}});
      tick(100);
      history.capture({'fields.desc': {before: '', after: 'b'}});

      const store = createStore({'fields.title': 'a', 'fields.desc': 'b'});
      const first = history.undo(store.get);
      expect(first.status).toEqual('applied');
      if (first.status === 'applied') {
        expect(first.updates).toEqual({'fields.desc': ''});
        store.applyUpdates(first.updates);
      }
      expect(history.canUndo()).toBe(true);
    });

    it('does not merge captures outside the coalesce window', () => {
      const {history, tick} = createHistory();
      history.capture({'fields.title': {before: '', after: 'a'}});
      tick(2000);
      history.capture({'fields.title': {before: 'a', after: 'ab'}});

      const store = createStore({'fields.title': 'ab'});
      const first = history.undo(store.get);
      if (first.status === 'applied') {
        expect(first.updates).toEqual({'fields.title': 'a'});
        store.applyUpdates(first.updates);
      }
      expect(history.canUndo()).toBe(true);
    });

    it('never merges multi-key captures', () => {
      const {history, tick} = createHistory();
      history.capture({'fields.a': {before: 1, after: 2}});
      tick(100);
      history.capture({
        'fields.a': {before: 2, after: 3},
        'fields.b': {before: 1, after: 2},
      });
      const store = createStore({'fields.a': 3, 'fields.b': 2});
      const first = history.undo(store.get);
      if (first.status === 'applied') {
        expect(first.updates).toEqual({'fields.a': 2, 'fields.b': 1});
        store.applyUpdates(first.updates);
      }
      expect(history.canUndo()).toBe(true);
    });

    it('drops the entry when coalescing cancels out to a no-op', () => {
      const {history, tick} = createHistory();
      history.capture({'fields.title': {before: 'a', after: 'ab'}});
      tick(100);
      history.capture({'fields.title': {before: 'ab', after: 'a'}});
      expect(history.canUndo()).toBe(false);
    });

    it('never merges into a group() entry', () => {
      const {history, tick} = createHistory();
      history.group('Move item', () => {
        history.capture({'fields.a': {before: 1, after: 2}});
      });
      tick(100);
      history.capture({'fields.a': {before: 2, after: 3}});

      const store = createStore({'fields.a': 3});
      const first = history.undo(store.get);
      if (first.status === 'applied') {
        expect(first.updates).toEqual({'fields.a': 2});
        store.applyUpdates(first.updates);
      }
      expect(history.canUndo()).toBe(true);
    });
  });

  describe('group()', () => {
    it('merges all captures during the callback into one entry', () => {
      const {history} = createHistory();
      const store = createStore({
        'fields.blocks._array': ['b'],
        'fields.blocks.b': {title: 'B'},
      });

      history.group('Move item', () => {
        history.capture({
          'fields.blocks._array': {before: ['a', 'b'], after: ['b']},
          'fields.blocks.a': {before: {title: 'A'}, after: undefined},
        });
        history.capture({
          'fields.blocks._array': {before: ['b'], after: ['b', 'a2']},
          'fields.blocks.a2': {before: undefined, after: {title: 'A'}},
        });
      });

      store.applyUpdates({
        'fields.blocks._array': ['b', 'a2'],
        'fields.blocks.a2': {title: 'A'},
      });
      const undone = history.undo(store.get);
      expect(undone.status).toEqual('applied');
      if (undone.status === 'applied') {
        // The group undoes to the pre-group state in one step, including the
        // first-seen `before` for the twice-captured `_array` key.
        expect(undone.updates['fields.blocks._array']).toEqual(['a', 'b']);
        expect(undone.updates['fields.blocks.a']).toEqual({title: 'A'});
        expect(undone.updates['fields.blocks.a2']).toBeUndefined();
        expect(undone.entry.label).toEqual('Move item');
      }
      expect(history.canUndo()).toBe(false);
    });

    it('does not push an entry when the group cancels out', () => {
      const {history} = createHistory();
      history.group('noop', () => {
        history.capture({'fields.a': {before: 1, after: 2}});
        history.capture({'fields.a': {before: 2, after: 1}});
      });
      expect(history.canUndo()).toBe(false);
    });

    it('joins nested groups into the outermost group', () => {
      const {history} = createHistory();
      history.group('outer', () => {
        history.capture({'fields.a': {before: 1, after: 2}});
        history.group('inner', () => {
          history.capture({'fields.b': {before: 1, after: 2}});
        });
      });
      const store = createStore({'fields.a': 2, 'fields.b': 2});
      const undone = history.undo(store.get);
      expect(undone.status).toEqual('applied');
      if (undone.status === 'applied') {
        expect(undone.updates).toEqual({'fields.a': 1, 'fields.b': 1});
        expect(undone.entry.label).toEqual('outer');
      }
      expect(history.canUndo()).toBe(false);
    });
  });

  it('caps the number of entries, dropping the oldest', () => {
    const {history, tick} = createHistory({maxEntries: 3});
    const store = createStore();
    for (let i = 1; i <= 5; i++) {
      store.set('fields.n', i);
      history.capture({'fields.n': {before: i - 1, after: i}});
      tick(5000);
    }
    // Only the newest 3 entries survive: 5->4, 4->3, 3->2.
    for (const expected of [4, 3, 2]) {
      const result = history.undo(store.get);
      expect(result.status).toEqual('applied');
      if (result.status === 'applied') {
        store.applyUpdates(result.updates);
        expect(store.get('fields.n')).toEqual(expected);
      }
    }
    expect(history.canUndo()).toBe(false);
  });

  describe('conflict handling', () => {
    it('drops the entry and applies nothing when the current value no longer matches', () => {
      const {history} = createHistory();
      const store = createStore({'fields.title': 'v1'});

      store.set('fields.title', 'v2');
      history.capture({'fields.title': {before: 'v1', after: 'v2'}});

      // A remote edit lands on the same key (without a local capture).
      store.set('fields.title', 'remote');

      const result = history.undo(store.get);
      expect(result.status).toEqual('conflict');
      expect(store.get('fields.title')).toEqual('remote');
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);
    });

    it('conflicts on redo when a newer value landed after the undo', () => {
      const {history} = createHistory();
      const store = createStore({'fields.title': 'v1'});

      store.set('fields.title', 'v2');
      history.capture({'fields.title': {before: 'v1', after: 'v2'}});
      const undone = history.undo(store.get);
      if (undone.status === 'applied') {
        store.applyUpdates(undone.updates);
      }

      store.set('fields.title', 'remote');
      const result = history.redo(store.get);
      expect(result.status).toEqual('conflict');
      expect(store.get('fields.title')).toEqual('remote');
      expect(history.canRedo()).toBe(false);
    });
  });

  describe('handleRemoteData()', () => {
    it('drains conflicting entries from the top of the undo stack', () => {
      const {history, tick} = createHistory();
      const store = createStore();
      store.set('fields.a', 1);
      history.capture({'fields.a': {before: undefined, after: 1}});
      tick(5000);
      store.set('fields.b', 2);
      history.capture({'fields.b': {before: undefined, after: 2}});
      tick(5000);

      // Remote replacement wipes both fields.
      store.applyUpdates({'fields.a': undefined, 'fields.b': undefined});
      history.handleRemoteData(store.get);
      expect(history.canUndo()).toBe(false);
    });

    it('stops draining at the first non-conflicting entry', () => {
      const {history, tick} = createHistory();
      const store = createStore();
      store.set('fields.a', 1);
      history.capture({'fields.a': {before: undefined, after: 1}});
      tick(5000);
      store.set('fields.b', 2);
      history.capture({'fields.b': {before: undefined, after: 2}});
      tick(5000);

      // Remote edit only touches the newest entry's key.
      store.set('fields.b', 99);
      history.handleRemoteData(store.get);
      expect(history.canUndo()).toBe(true);

      const result = history.undo(store.get);
      expect(result.status).toEqual('applied');
      if (result.status === 'applied') {
        expect(result.updates).toEqual({'fields.a': undefined});
      }
    });

    it('keeps entries when our own committed write echoes back unchanged', () => {
      const {history} = createHistory();
      const store = createStore({'fields.title': 'v1'});
      store.set('fields.title', 'v2');
      history.capture({'fields.title': {before: 'v1', after: 'v2'}});

      // Same data arrives via a snapshot (values unchanged).
      history.handleRemoteData(store.get);
      expect(history.canUndo()).toBe(true);
    });

    it('drains conflicting redo entries against their before values', () => {
      const {history} = createHistory();
      const store = createStore({'fields.title': 'v1'});
      store.set('fields.title', 'v2');
      history.capture({'fields.title': {before: 'v1', after: 'v2'}});
      const undone = history.undo(store.get);
      if (undone.status === 'applied') {
        store.applyUpdates(undone.updates);
      }
      expect(history.canRedo()).toBe(true);

      store.set('fields.title', 'remote');
      history.handleRemoteData(store.get);
      expect(history.canRedo()).toBe(false);
    });
  });

  describe('cloning and aliasing', () => {
    it('isolates captured values from later in-place mutations', () => {
      const {history, tick} = createHistory();
      const item = {title: 'original'};
      const store = createStore();
      store.set('fields.item', item);
      history.capture({'fields.item': {before: undefined, after: item}});
      tick(5000);

      // The store mutates the same object in place (as JsonTrieStore does)
      // and a separate capture records the child edit.
      item.title = 'edited';
      history.capture({
        'fields.item.title': {before: 'original', after: 'edited'},
      });
      tick(5000);

      // Undo the child edit first.
      const first = history.undo((key) => {
        if (key === 'fields.item.title') {
          return item.title;
        }
        return store.get(key);
      });
      expect(first.status).toEqual('applied');
      if (first.status === 'applied') {
        item.title = first.updates['fields.item.title'];
      }

      // The add-entry's captured `after` must still hold the ORIGINAL item
      // (title: 'original'), not the mutated one, so validation passes.
      const second = history.undo(store.get);
      expect(second.status).toEqual('applied');
    });

    it('returns cloned updates so store mutations cannot corrupt redo', () => {
      const {history} = createHistory();
      const store = createStore({'fields.obj': {n: 1}});
      store.set('fields.obj', {n: 2});
      history.capture({'fields.obj': {before: {n: 1}, after: {n: 2}}});

      const undone = history.undo(store.get);
      expect(undone.status).toEqual('applied');
      if (undone.status !== 'applied') {
        return;
      }
      store.applyUpdates(undone.updates);
      // Simulate an in-place store mutation of the applied object.
      store.get('fields.obj').n = 99;

      // Redo must detect the conflict (current {n:99} != before {n:1})
      // instead of silently re-applying over the newer edit.
      const redone = history.redo(store.get);
      expect(redone.status).toEqual('conflict');
    });

    it('passes non-plain objects through by reference when cloning', () => {
      class FakeTimestamp {
        constructor(readonly seconds: number) {}
      }
      const ts = new FakeTimestamp(123);
      const cloned = clonePreservingNonPlain({a: {b: ts}, c: [ts]});
      expect(cloned.a.b).toBe(ts);
      expect(cloned.c[0]).toBe(ts);
      expect(cloned.a).not.toBe(undefined);
    });
  });

  describe('rich text time bump', () => {
    const richText = () => ({
      time: 500,
      version: '1.0.0',
      blocks: [{type: 'paragraph', data: {text: 'hello'}}],
    });

    it('stamps restored rich text values with a fresh time', () => {
      const {history, getTime} = createHistory();
      const before = richText();
      const after = {...richText(), time: 600, blocks: []};
      const store = createStore({'fields.body': after});
      history.capture({'fields.body': {before, after}});

      const undone = history.undo(store.get);
      expect(undone.status).toEqual('applied');
      if (undone.status === 'applied') {
        expect(undone.updates['fields.body'].time).toEqual(getTime());
        expect(undone.updates['fields.body'].time).not.toEqual(500);
      }
    });

    it('keeps redo validation passing after the time bump', () => {
      const {history} = createHistory();
      const before = richText();
      const after = {...richText(), time: 600};
      const store = createStore({'fields.body': after});
      history.capture({'fields.body': {before, after}});

      const undone = history.undo(store.get);
      if (undone.status === 'applied') {
        store.applyUpdates(undone.updates);
      }
      // The bump was written back into the stored entry, so the redo
      // validation (current value vs entry.before) still matches exactly.
      const redone = history.redo(store.get);
      expect(redone.status).toEqual('applied');
      if (redone.status === 'applied') {
        store.applyUpdates(redone.updates);
      }
      // And undo again still validates against the re-bumped `after`.
      const undoneAgain = history.undo(store.get);
      expect(undoneAgain.status).toEqual('applied');
    });

    it('bumps rich text nested inside restored objects', () => {
      const now = () => 9999;
      const value = {section: {body: richText()}, other: 'x'};
      bumpRichTextTimes(value, now);
      expect(value.section.body.time).toEqual(9999);
      expect(value.other).toEqual('x');
    });
  });

  it('clear() empties both stacks', () => {
    const {history} = createHistory();
    const store = createStore({'fields.title': 'v1'});
    store.set('fields.title', 'v2');
    history.capture({'fields.title': {before: 'v1', after: 'v2'}});
    const undone = history.undo(store.get);
    if (undone.status === 'applied') {
      store.applyUpdates(undone.updates);
    }
    store.set('fields.other', 1);
    history.capture({'fields.other': {before: undefined, after: 1}});
    history.clear();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it('emits change events when stacks change', () => {
    const {history} = createHistory();
    const events: number[] = [];
    history.onChange(() => events.push(1));
    history.capture({'fields.a': {before: 1, after: 2}});
    expect(events.length).toEqual(1);
    const store = createStore({'fields.a': 2});
    history.undo(store.get);
    expect(events.length).toEqual(2);
  });
});
