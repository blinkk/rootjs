import {describe, it, expect, vi} from 'vitest';
import {Emitter} from './emitter.js';

describe('Emitter', () => {
  it('notifies subscribers with the payload', () => {
    const emitter = new Emitter<{foo: {value: number}}>();
    const cb = vi.fn();
    emitter.on('foo', cb);
    emitter.emit('foo', {value: 42});
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({value: 42});
  });

  it('on() returns an unsubscribe function', () => {
    const emitter = new Emitter<{foo: void}>();
    const cb = vi.fn();
    const unsubscribe = emitter.on('foo', cb);
    unsubscribe();
    emitter.emit('foo', undefined);
    expect(cb).not.toHaveBeenCalled();
  });

  it('off() removes a subscriber', () => {
    const emitter = new Emitter<{foo: void}>();
    const cb = vi.fn();
    emitter.on('foo', cb);
    emitter.off('foo', cb);
    emitter.emit('foo', undefined);
    expect(cb).not.toHaveBeenCalled();
  });

  it('removeAll() removes all subscribers', () => {
    const emitter = new Emitter<{foo: void; bar: void}>();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    emitter.on('foo', cb1);
    emitter.on('bar', cb2);
    emitter.removeAll();
    emitter.emit('foo', undefined);
    emitter.emit('bar', undefined);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });

  it('only notifies subscribers of the emitted event type', () => {
    const emitter = new Emitter<{foo: void; bar: void}>();
    const cb = vi.fn();
    emitter.on('foo', cb);
    emitter.emit('bar', undefined);
    expect(cb).not.toHaveBeenCalled();
  });
});
