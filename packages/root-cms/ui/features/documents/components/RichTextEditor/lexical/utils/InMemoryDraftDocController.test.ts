import {describe, it, expect} from 'vitest';
import {DraftDocEventType} from '../../../../useDraftDoc.js';
import {InMemoryDraftDocController} from './InMemoryDraftDocController.js';

describe('InMemoryDraftDocController', () => {
  it('should dispatch VALUE_CHANGE event', () =>
    new Promise<void>((resolve, reject) => {
      const controller = new InMemoryDraftDocController({
        foo: 'bar',
      });

      controller.on(DraftDocEventType.VALUE_CHANGE, (key, value) => {
        try {
          expect(key).toBe('block.foo');
          expect(value).toBe('baz');
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      controller.updateKey('block.foo', 'baz');
    }));

  it('should expose a subscribeSubtree method', () => {
    // `DocEditor.ArrayFieldPreview` calls `draft.subscribeSubtree(...)`, so the
    // in-memory controller must expose this API for block edit modals to work.
    const controller = new InMemoryDraftDocController({foo: 'bar'});
    expect(typeof controller.subscribeSubtree).toBe('function');
    const seen: any[] = [];
    const unsubscribe = controller.subscribeSubtree('block.foo', (value) => {
      seen.push(value);
    });
    expect(seen).toEqual(['bar']);
    controller.updateKey('block.foo', 'baz');
    expect(seen).toEqual(['bar', 'baz']);
    unsubscribe();
  });

  it('should use the parent doc id and sys data when provided', () => {
    const parent = {
      docId: 'Pages/foo',
      collectionId: 'Pages',
      slug: 'foo',
      getValue: (key: string) =>
        key === 'sys' ? {l10nSheet: {spreadsheetId: 'abc'}} : undefined,
    };
    const controller = new InMemoryDraftDocController({foo: 'bar'}, 'block', {
      parent,
    });
    expect(controller.docId).toBe('Pages/foo');
    expect(controller.collectionId).toBe('Pages');
    expect(controller.slug).toBe('foo');
    expect(controller.getData()).toEqual({
      block: {foo: 'bar'},
      sys: {l10nSheet: {spreadsheetId: 'abc'}},
    });
  });

  it('should fall back to a placeholder doc id without a parent', () => {
    const controller = new InMemoryDraftDocController({});
    expect(controller.docId).toBe('custom-block');
    expect(controller.getData()).toEqual({block: {}});
  });

  it('should support grouped history and undo of an array item removal', () => {
    const controller = new InMemoryDraftDocController({
      images: {_array: ['a', 'b'], a: {caption: 'A'}, b: {caption: 'B'}},
    });
    const appliedKeys: string[][] = [];
    controller.on(DraftDocEventType.HISTORY_APPLIED, (keys: string[]) => {
      appliedKeys.push(keys);
    });

    controller.history.group('Removed item', () => {
      controller.updateKeys({
        'block.images._array': ['a'],
        'block.images.b': undefined,
      });
    });
    expect(controller.history.peekUndo()?.label).toBe('Removed item');
    // Removed keys are deleted rather than set to `undefined`.
    expect(controller.getValue('block.images')).toEqual({
      _array: ['a'],
      a: {caption: 'A'},
    });
    expect('b' in controller.getValue('block.images')).toBe(false);

    const entryId = controller.history.peekUndo()!.id;
    const result = controller.undo({onlyEntryId: entryId});
    expect(result.status).toBe('applied');
    expect(controller.getValue('block.images')).toEqual({
      _array: ['a', 'b'],
      a: {caption: 'A'},
      b: {caption: 'B'},
    });
    expect(appliedKeys).toEqual([['block.images._array', 'block.images.b']]);

    expect(controller.redo().status).toBe('applied');
    expect(controller.getValue('block.images')).toEqual({
      _array: ['a'],
      a: {caption: 'A'},
    });
  });

  it('should not capture sys keys in history', () => {
    const controller = new InMemoryDraftDocController({});
    controller.updateKey('sys.foo', 'bar');
    expect(controller.history.canUndo()).toBe(false);
  });

  it('should notify listeners after all keys in a batch are written', () => {
    const controller = new InMemoryDraftDocController({
      images: {_array: ['a'], a: {caption: 'A'}},
    });
    const seen: any[] = [];
    controller.subscribe('block.images', (value) => {
      seen.push({...value});
    });
    seen.length = 0;
    controller.updateKeys({
      'block.images._array': ['a', 'b'],
      'block.images.b': {caption: 'B'},
    });
    expect(seen).toEqual([
      {_array: ['a', 'b'], a: {caption: 'A'}, b: {caption: 'B'}},
    ]);
  });

  it('should notify descendant listeners when a parent is replaced', () => {
    const controller = new InMemoryDraftDocController({
      meta: {title: 'Foo', description: 'Bar'},
    });
    const titles: any[] = [];
    const descriptions: any[] = [];
    controller.subscribe('block.meta.title', (value) => titles.push(value));
    controller.subscribe('block.meta.description', (value) =>
      descriptions.push(value)
    );
    controller.updateKey('block.meta', {title: 'Baz', description: 'Bar'});
    expect(titles).toEqual(['Foo', 'Baz']);
    // Unchanged descendants are not notified.
    expect(descriptions).toEqual(['Bar']);

    controller.removeKey('block.meta');
    expect(titles).toEqual(['Foo', 'Baz', undefined]);
    expect(descriptions).toEqual(['Bar', undefined]);
  });
});
