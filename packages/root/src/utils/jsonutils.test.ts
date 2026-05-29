import {assert, test} from 'vitest';

import {normalizeLineEndings, stringifyJson} from './jsonutils.js';

test('normalizeLineEndings converts CRLF to LF', () => {
  assert.equal(normalizeLineEndings('a\r\nb'), 'a\nb');
});

test('normalizeLineEndings converts lone CR to LF', () => {
  assert.equal(normalizeLineEndings('a\rb'), 'a\nb');
});

test('normalizeLineEndings leaves LF alone', () => {
  assert.equal(normalizeLineEndings('a\nb'), 'a\nb');
});

test('stringifyJson normalizes CRLF in string values', () => {
  const out = stringifyJson({msg: 'hello\r\nworld'});
  assert.equal(out, '{"msg":"hello\\nworld"}');
  assert.deepEqual(JSON.parse(out), {msg: 'hello\nworld'});
});

test('stringifyJson normalizes lone CR in string values', () => {
  const out = stringifyJson({msg: 'hello\rworld'});
  assert.deepEqual(JSON.parse(out), {msg: 'hello\nworld'});
});

test('stringifyJson normalizes nested values', () => {
  const out = stringifyJson({
    list: ['a\r\nb', {nested: 'c\rd'}],
  });
  assert.deepEqual(JSON.parse(out), {
    list: ['a\nb', {nested: 'c\nd'}],
  });
});

test('stringifyJson supports indentation', () => {
  const out = stringifyJson({a: 1, b: 2}, 2);
  assert.equal(out, '{\n  "a": 1,\n  "b": 2\n}');
  assert.notInclude(out, '\r');
});

test('stringifyJson handles primitive values', () => {
  assert.equal(stringifyJson('a\r\nb'), '"a\\nb"');
  assert.equal(stringifyJson(42), '42');
  assert.equal(stringifyJson(null), 'null');
});
