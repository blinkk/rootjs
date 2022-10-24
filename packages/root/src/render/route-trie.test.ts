import {assert, afterEach, beforeEach, test} from 'vitest';
import {RouteTrie} from './route-trie';

let routeTrie: RouteTrie<string>;

beforeEach(() => {
  routeTrie = new RouteTrie();
});

afterEach(() => {
  routeTrie.clear();
});

test('get routes from route trie', () => {
  routeTrie.add('/', 'index');
  routeTrie.add('/a', 'a');
  routeTrie.add('/b', 'b');
  routeTrie.add('/a/b/c', 'c');

  assert.deepEqual(routeTrie.get('/'), ['index', {}]);
  assert.deepEqual(routeTrie.get('/a'), ['a', {}]);
  assert.deepEqual(routeTrie.get('/a/'), ['a', {}]);
  assert.deepEqual(routeTrie.get('/b'), ['b', {}]);
  assert.deepEqual(routeTrie.get('/b/'), ['b', {}]);
  assert.deepEqual(routeTrie.get('/a/b/c'), ['c', {}]);
  assert.deepEqual(routeTrie.get('/a/b/c/'), ['c', {}]);
});

test('get parameterized routes from route trie', () => {
  routeTrie.add('/', 'a');
  routeTrie.add('/[slug]', 'b');
  routeTrie.add('/foo/[slug]', 'c');
  routeTrie.add('/foo/[slug]/bar', 'd');
  routeTrie.add('/[...wild]', 'e');
  routeTrie.add('/f/[...wild]', 'f');

  assert.deepEqual(routeTrie.get('/'), ['a', {}]);
  assert.deepEqual(routeTrie.get('/b'), ['b', {slug: 'b'}]);
  assert.deepEqual(routeTrie.get('/b/'), ['b', {slug: 'b'}]);
  assert.deepEqual(routeTrie.get('/foo/c'), ['c', {slug: 'c'}]);
  assert.deepEqual(routeTrie.get('/foo/c/'), ['c', {slug: 'c'}]);
  assert.deepEqual(routeTrie.get('/foo/cc'), ['c', {slug: 'cc'}]);
  assert.deepEqual(routeTrie.get('/foo/cc/'), ['c', {slug: 'cc'}]);
  assert.deepEqual(routeTrie.get('/foo/d/bar'), ['d', {slug: 'd'}]);
  assert.deepEqual(routeTrie.get('/foo/dd/bar'), ['d', {slug: 'dd'}]);
});