import {EventEmitter} from 'node:events';

import {afterEach, assert, beforeEach, test, vi} from 'vitest';

interface ScriptStep {
  code?: number;
  stdout?: string;
  stderr?: string;
  errorCode?: string;
}

const {calls, queue} = vi.hoisted(() => ({
  calls: [] as Array<{args: string[]; stdin: string}>,
  queue: [] as ScriptStep[],
}));

vi.mock('node:child_process', () => ({
  spawn: (_cmd: string, args: string[]) => {
    const child: any = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    const record = {args, stdin: ''};
    calls.push(record);
    child.stdin = {
      end: (data?: string) => {
        record.stdin = data ?? '';
      },
    };
    const step = queue.shift() || {code: 0};
    setImmediate(() => {
      if (step.errorCode) {
        child.emit(
          'error',
          Object.assign(new Error('spawn failed'), {code: step.errorCode})
        );
        return;
      }
      if (step.stdout) {
        child.stdout.emit('data', Buffer.from(step.stdout));
      }
      if (step.stderr) {
        child.stderr.emit('data', Buffer.from(step.stderr));
      }
      child.emit('close', step.code ?? 0);
    });
    return child;
  },
}));

import {
  accessSecretJson,
  GcloudError,
  runGcloud,
  writeSecretJson,
} from './gcloud.js';

beforeEach(() => {
  calls.length = 0;
  queue.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('runGcloud resolves stdout on success', async () => {
  queue.push({code: 0, stdout: 'hello'});
  const out = await runGcloud(['version']);
  assert.equal(out, 'hello');
  assert.deepEqual(calls[0].args, ['version']);
});

test('accessSecretJson parses a JSON object', async () => {
  queue.push({code: 0, stdout: '{"API_KEY":"v1"}'});
  const blob = await accessSecretJson('site-a', 'proj');
  assert.deepEqual(blob, {API_KEY: 'v1'});
  assert.include(calls[0].args, '--secret');
  assert.include(calls[0].args, 'site-a');
  assert.include(calls[0].args, '--project');
  assert.include(calls[0].args, 'proj');
});

test('accessSecretJson treats NOT_FOUND as an empty blob', async () => {
  queue.push({code: 1, stderr: 'NOT_FOUND: Secret [x] not found.'});
  const blob = await accessSecretJson('missing', 'proj');
  assert.deepEqual(blob, {});
});

test('writeSecretJson creates the secret then adds a version via stdin', async () => {
  queue.push({code: 0}); // create
  queue.push({code: 0}); // versions add
  await writeSecretJson('site-a', 'proj', {API_KEY: 'v2'});

  assert.include(calls[0].args, 'create');
  assert.include(calls[1].args, 'add');
  assert.include(calls[1].args, '--data-file=-');
  // Payload goes over stdin, never argv.
  assert.deepEqual(JSON.parse(calls[1].stdin), {API_KEY: 'v2'});
  for (const call of calls) {
    assert.notInclude(call.args.join(' '), 'v2');
  }
});

test('writeSecretJson tolerates an already-existing secret', async () => {
  queue.push({
    code: 1,
    stderr: 'ALREADY_EXISTS: Secret [site-a] already exists.',
  });
  queue.push({code: 0}); // versions add
  await writeSecretJson('site-a', 'proj', {API_KEY: 'v2'});
  assert.equal(calls.length, 2);
});

test('runGcloud maps a missing binary to an ENOENT GcloudError', async () => {
  queue.push({errorCode: 'ENOENT'});
  let err: any;
  try {
    await runGcloud(['version']);
  } catch (e) {
    err = e;
  }
  assert.instanceOf(err, GcloudError);
  assert.equal(err.code, 'ENOENT');
  assert.match(err.message, /Google Cloud CLI/);
});

test('runGcloud classifies permission and auth errors', async () => {
  queue.push({code: 1, stderr: 'PERMISSION_DENIED: caller lacks permission'});
  let err: any;
  try {
    await runGcloud(['secrets', 'list']);
  } catch (e) {
    err = e;
  }
  assert.equal(err.code, 'PERMISSION_DENIED');

  queue.push({
    code: 1,
    stderr: 'UNAUTHENTICATED: please run gcloud auth login',
  });
  let err2: any;
  try {
    await runGcloud(['secrets', 'list']);
  } catch (e) {
    err2 = e;
  }
  assert.equal(err2.code, 'UNAUTHENTICATED');
});
