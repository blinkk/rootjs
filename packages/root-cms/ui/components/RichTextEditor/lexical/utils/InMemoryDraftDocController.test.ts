import {describe, it, expect} from 'vitest';
import {DraftDocEventType} from '../../../../hooks/useDraftDoc.js';
import {InMemoryDraftDocController} from './InMemoryDraftDocController.js';

describe('InMemoryDraftDocController', () => {
  it('should support .on() method', () => {
    const controller = new InMemoryDraftDocController({});
    expect(typeof controller.on).toBe('function');
  });

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
});
