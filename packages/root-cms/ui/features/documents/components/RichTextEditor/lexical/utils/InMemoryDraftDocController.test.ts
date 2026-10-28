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
});
