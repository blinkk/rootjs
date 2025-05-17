import {assert, afterEach, beforeEach, test} from 'vitest';
import {RouteTrie} from './route-trie.js';

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

test('get nested parameterized route from route trie', () => {
  routeTrie.add('/[slug]', '1');
  routeTrie.add('/[ref]/[slug]', '2');
  routeTrie.add('/[ref]/[slug]/foo', '3');

  assert.deepEqual(routeTrie.get('/blog'), ['1', {slug: 'blog'}]);
  assert.deepEqual(routeTrie.get('/blog/foo'), [
    '2',
    {ref: 'blog', slug: 'foo'},
  ]);
  assert.deepEqual(routeTrie.get('/blog/bar/foo'), [
    '3',
    {ref: 'blog', slug: 'bar'},
  ]);
});

test('get catch-all routes', () => {
  routeTrie.add('/[...slug]', '1');

  assert.deepEqual(routeTrie.get('/'), [undefined, {}]);
  assert.deepEqual(routeTrie.get('/blog'), ['1', {slug: 'blog'}]);
  assert.deepEqual(routeTrie.get('/blog/'), ['1', {slug: 'blog'}]);
  assert.deepEqual(routeTrie.get('/blog/foo'), ['1', {slug: 'blog/foo'}]);
  assert.deepEqual(routeTrie.get('/blog/foo/'), ['1', {slug: 'blog/foo'}]);
});

test('get nested catch-all routes', () => {
  routeTrie.add('/blog/[...slug]', '1');

  assert.deepEqual(routeTrie.get('/'), [undefined, {}]);
  assert.deepEqual(routeTrie.get('/blog'), [undefined, {}]);
  assert.deepEqual(routeTrie.get('/blog/'), [undefined, {}]);
  assert.deepEqual(routeTrie.get('/blog/foo'), ['1', {slug: 'foo'}]);
  assert.deepEqual(routeTrie.get('/blog/foo/'), ['1', {slug: 'foo'}]);
  assert.deepEqual(routeTrie.get('/blog/foo/bar'), ['1', {slug: 'foo/bar'}]);
  assert.deepEqual(routeTrie.get('/blog/foo/bar/'), ['1', {slug: 'foo/bar'}]);
});

test('get optional catch-all routes', () => {
  routeTrie.add('/[[...slug]]', '1');
  routeTrie.add('/foo', '2');
  routeTrie.add('/foo/bar', '3');

  assert.deepEqual(routeTrie.get('/'), ['1', {}]);
  assert.deepEqual(routeTrie.get('/blog'), ['1', {slug: 'blog'}]);
  assert.deepEqual(routeTrie.get('/blog/'), ['1', {slug: 'blog'}]);
  assert.deepEqual(routeTrie.get('/blog/foo'), ['1', {slug: 'blog/foo'}]);
  assert.deepEqual(routeTrie.get('/blog/foo/'), ['1', {slug: 'blog/foo'}]);
  assert.deepEqual(routeTrie.get('/foo'), ['2', {}]);
  assert.deepEqual(routeTrie.get('/foo/'), ['2', {}]);
  assert.deepEqual(routeTrie.get('/foo/bar'), ['3', {}]);
  assert.deepEqual(routeTrie.get('/foo/bar/'), ['3', {}]);
});

test('walk all routes', async () => {
  routeTrie.add('/', 'root');
  routeTrie.add('/foo', 'foo');
  routeTrie.add('/bar', 'bar');
  routeTrie.add('/foo/[id]', 'param');
  routeTrie.add('/[...rest]', 'wild');

  const visited: Array<[string, string]> = [];
  await routeTrie.walk((urlPath, route) => {
    visited.push([urlPath, route]);
  });

  const expected = [
    ['/', 'root'],
    ['/foo/', 'foo'],
    ['/foo/[id]/', 'param'],
    ['/bar/', 'bar'],
    ['/[...rest]', 'wild'],
  ];

  assert.deepEqual(
    visited.sort((a, b) => a[0].localeCompare(b[0])),
    expected.sort((a, b) => a[0].localeCompare(b[0]))
  );
});
