import {assert, test} from 'vitest';
import {replaceParams} from './router';

test('replace params', () => {
  assert.equal(replaceParams('/foo', {foo: 'bar'}), '/foo');
  assert.equal(replaceParams('/[foo]', {foo: 'bar'}), '/bar');
  assert.equal(replaceParams('/[...foo]', {foo: 'bar'}), '/bar');

  assert.equal(replaceParams('/foo/[foo]', {foo: 'bar'}), '/foo/bar');
  assert.equal(replaceParams('/foo/[...foo]', {foo: 'bar'}), '/foo/bar');
  assert.equal(replaceParams('/[foo]/[foo]', {foo: 'bar'}), '/bar/bar');
  assert.equal(replaceParams('/[foo]/[...foo]', {foo: 'bar'}), '/bar/bar');

  assert.equal(replaceParams('/[foo]/[bar]', {foo: 'a', bar: 'b'}), '/a/b');
  assert.equal(replaceParams('/[foo]/[...bar]', {foo: 'a', bar: 'b'}), '/a/b');

  assert.throws(() => {
    replaceParams('/[foo]', {});
  });
});
