import {assert, test} from 'vitest';

import {jsonStringify, normalizeLineEndings} from './jsonutils.js';

test('normalizeLineEndings converts CRLF to LF', () => {
  assert.equal(normalizeLineEndings('a\r\nb'), 'a\nb');
});

test('normalizeLineEndings converts lone CR to LF', () => {
  assert.equal(normalizeLineEndings('a\rb'), 'a\nb');
});

test('normalizeLineEndings leaves LF alone', () => {
  assert.equal(normalizeLineEndings('a\nb'), 'a\nb');
});

test('jsonStringify normalizes CRLF in string values', () => {
  const out = jsonStringify({msg: 'hello\r\nworld'});
  assert.equal(out, '{"msg":"hello\\nworld"}');
  assert.deepEqual(JSON.parse(out), {msg: 'hello\nworld'});
});

test('jsonStringify normalizes lone CR in string values', () => {
  const out = jsonStringify({msg: 'hello\rworld'});
  assert.deepEqual(JSON.parse(out), {msg: 'hello\nworld'});
});

test('jsonStringify normalizes nested values', () => {
  const out = jsonStringify({
    list: ['a\r\nb', {nested: 'c\rd'}],
  });
  assert.deepEqual(JSON.parse(out), {
    list: ['a\nb', {nested: 'c\nd'}],
  });
});

test('jsonStringify supports indent option', () => {
  const out = jsonStringify({a: 1, b: 2}, {indent: 2});
  assert.equal(out, '{\n  "a": 1,\n  "b": 2\n}');
  assert.notInclude(out, '\r');
});

test('jsonStringify supports string indent', () => {
  const out = jsonStringify({a: 1}, {indent: '\t'});
  assert.equal(out, '{\n\t"a": 1\n}');
});

test('jsonStringify handles primitive values', () => {
  assert.equal(jsonStringify('a\r\nb'), '"a\\nb"');
  assert.equal(jsonStringify(42), '42');
  assert.equal(jsonStringify(null), 'null');
});

test('jsonStringify works without options', () => {
  assert.equal(jsonStringify({a: 1}), '{"a":1}');
});
