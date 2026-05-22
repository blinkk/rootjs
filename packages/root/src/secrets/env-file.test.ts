import {assert, test} from 'vitest';

import {parseEnv, serializeEnvValue, upsertEnvVars} from './env-file.js';

// Values that should survive a serialize -> dotenv.parse round-trip exactly.
const ROUND_TRIP = [
  'abc123',
  'a b c',
  'value#notcomment',
  'k=v&x=y',
  'postgres://u:p@h:5432/db',
  '  pad  ',
  'line1\nline2\nline3',
  'a\r\nb',
  'a\tb',
  'he said "hi"',
  'C:\\path\\new',
  '',
  '{"json":true,"x":"a\\nb"}',
  '-----BEGIN-----\nABCD\n-----END-----\n',
  "it's a secret",
  'café→ok',
];

test('serializeEnvValue round-trips through dotenv.parse', () => {
  for (const value of ROUND_TRIP) {
    const line = `K=${serializeEnvValue(value)}`;
    assert.equal(
      parseEnv(line).K,
      value,
      `round-trip failed for ${JSON.stringify(value)}`
    );
  }
});

test('serialized values are always a single physical line', () => {
  for (const value of ROUND_TRIP) {
    assert.notInclude(serializeEnvValue(value), '\n');
  }
});

test('upsertEnvVars appends to an empty file', () => {
  const out = upsertEnvVars('', {API_KEY: 'abc'});
  assert.equal(out, "API_KEY='abc'\n");
});

test('upsertEnvVars replaces in place and preserves everything else', () => {
  const input = [
    '# comment',
    'UNMANAGED=keep',
    'API_KEY=old',
    '',
    'OTHER=value',
  ].join('\n');
  const out = upsertEnvVars(input, {API_KEY: 'new'});
  assert.equal(
    out,
    ['# comment', 'UNMANAGED=keep', "API_KEY='new'", '', 'OTHER=value'].join(
      '\n'
    ) + '\n'
  );
  // Unmanaged keys untouched.
  assert.equal(parseEnv(out).UNMANAGED, 'keep');
  assert.equal(parseEnv(out).OTHER, 'value');
  assert.equal(parseEnv(out).API_KEY, 'new');
});

test('upsertEnvVars deletes removed keys', () => {
  const input = 'A=1\nB=2\nC=3\n';
  const out = upsertEnvVars(input, {}, ['B']);
  assert.equal(out, 'A=1\nC=3\n');
});

test('upsertEnvVars drops duplicate occurrences of a managed key', () => {
  const input = 'API_KEY=one\nKEEP=yes\nAPI_KEY=two\n';
  const out = upsertEnvVars(input, {API_KEY: 'final'});
  assert.equal(out, "API_KEY='final'\nKEEP=yes\n");
});

test('upsertEnvVars honors `export ` prefixed assignments', () => {
  const input = 'export API_KEY=old\n';
  const out = upsertEnvVars(input, {API_KEY: 'new'});
  assert.equal(out, "API_KEY='new'\n");
});

test('upsertEnvVars preserves a dominant CRLF EOL', () => {
  const input = 'A=1\r\nB=2\r\n';
  const out = upsertEnvVars(input, {C: '3'});
  assert.equal(out, "A=1\r\nB=2\r\nC='3'\r\n");
});
