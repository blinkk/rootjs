import {describe, expect, it, vi} from 'vitest';
import {JsonTrieStore} from './json-trie-store.js';

function waitForInitialSubscriptionCallbacks() {
  return new Promise<void>((resolve) => {
    window.setTimeout(() => resolve());
  });
}

describe('JsonTrieStore', () => {
  it('notifies subtree subscribers for descendant updates without changing exact subscriptions', async () => {
    const store = new JsonTrieStore({
      fields: {
        items: {
          abc: {title: 'Old', body: 'Keep'},
          def: {title: 'Other'},
        },
      },
    });
    const abcSubtree = vi.fn();
    const defSubtree = vi.fn();
    const abcExact = vi.fn();

    store.subscribeSubtree('fields.items.abc', abcSubtree);
    store.subscribeSubtree('fields.items.def', defSubtree);
    store.subscribe('fields.items.abc', abcExact);
    await waitForInitialSubscriptionCallbacks();
    abcSubtree.mockClear();
    defSubtree.mockClear();
    abcExact.mockClear();

    store.update({'fields.items.abc.title': 'New'});

    expect(abcSubtree).toHaveBeenCalledOnce();
    expect(abcSubtree).toHaveBeenCalledWith({title: 'New', body: 'Keep'});
    expect(defSubtree).not.toHaveBeenCalled();
    expect(abcExact).not.toHaveBeenCalled();
  });

  it('notifies subtree subscribers when replacing the subscribed value', async () => {
    const store = new JsonTrieStore({
      fields: {
        items: {
          abc: {title: 'Old'},
        },
      },
    });
    const abcSubtree = vi.fn();

    store.subscribeSubtree('fields.items.abc', abcSubtree);
    await waitForInitialSubscriptionCallbacks();
    abcSubtree.mockClear();

    store.update({'fields.items.abc': {title: 'New'}});

    expect(abcSubtree).toHaveBeenCalledOnce();
    expect(abcSubtree).toHaveBeenCalledWith({title: 'New'});
  });

  it('notifies subtree subscribers after full data replacement', async () => {
    const store = new JsonTrieStore({
      fields: {
        items: {
          abc: {title: 'Old'},
        },
      },
    });
    const abcSubtree = vi.fn();

    store.subscribeSubtree('fields.items.abc', abcSubtree);
    await waitForInitialSubscriptionCallbacks();
    abcSubtree.mockClear();

    store.setData({
      fields: {
        items: {
          abc: {title: 'New'},
        },
      },
    });

    expect(abcSubtree).toHaveBeenCalledOnce();
    expect(abcSubtree).toHaveBeenCalledWith({title: 'New'});
  });

  it('notifies descendant subscribers when clearing a parent object', async () => {
    const store = new JsonTrieStore({
      fields: {
        meta: {
          title: 'Old title',
          nested: {body: 'Old body'},
        },
      },
    });
    const titleExact = vi.fn();
    const bodyExact = vi.fn();

    store.subscribe('fields.meta.title', titleExact);
    store.subscribe('fields.meta.nested.body', bodyExact);
    await waitForInitialSubscriptionCallbacks();
    titleExact.mockClear();
    bodyExact.mockClear();

    store.update({'fields.meta': undefined});

    expect(titleExact).toHaveBeenCalledOnce();
    expect(titleExact).toHaveBeenCalledWith(undefined);
    expect(bodyExact).toHaveBeenCalledOnce();
    expect(bodyExact).toHaveBeenCalledWith(undefined);
  });

  it('notifies descendant subscribers when replacing an empty parent with an object', async () => {
    const store = new JsonTrieStore({
      fields: {},
    });
    const titleExact = vi.fn();
    const bodyExact = vi.fn();

    store.subscribe('fields.meta.title', titleExact);
    store.subscribe('fields.meta.nested.body', bodyExact);
    await waitForInitialSubscriptionCallbacks();

    store.update({
      'fields.meta': {
        title: 'New title',
        nested: {body: 'New body'},
      },
    });

    expect(titleExact).toHaveBeenCalledOnce();
    expect(titleExact).toHaveBeenCalledWith('New title');
    expect(bodyExact).toHaveBeenCalledOnce();
    expect(bodyExact).toHaveBeenCalledWith('New body');
  });
});
