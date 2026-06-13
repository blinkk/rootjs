import {assert, test} from 'vitest';

import {
  BuildProgress,
  formatBytes,
  formatDuration,
  parseBuildLogMode,
} from './build-progress.js';

/** Strips ANSI escape codes for assertions. */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

class FakeStream {
  isTTY: boolean;
  chunks: string[] = [];

  constructor(options?: {isTTY?: boolean}) {
    this.isTTY = options?.isTTY ?? false;
  }

  write(str: string) {
    this.chunks.push(str);
    return true;
  }

  output(): string {
    return stripAnsi(this.chunks.join(''));
  }

  lines(): string[] {
    return this.output()
      .split('\n')
      .filter((line) => line.trim().length > 0);
  }
}

/** Fake clock, advanced manually by tests. */
function fakeClock(startMs = 0) {
  let now = startMs;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test('parseBuildLogMode accepts valid modes and defaults to progress', () => {
  assert.equal(parseBuildLogMode(undefined), 'progress');
  assert.equal(parseBuildLogMode(''), 'progress');
  assert.equal(parseBuildLogMode('progress'), 'progress');
  assert.equal(parseBuildLogMode('verbose'), 'verbose');
  assert.equal(parseBuildLogMode('quiet'), 'quiet');
  assert.throws(() => parseBuildLogMode('loud'), /invalid --log value/);
});

test('formatBytes formats sizes', () => {
  assert.equal(formatBytes(174), '0.17 kB');
  assert.equal(formatBytes(563056), '549.86 kB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5 MB');
});

test('formatDuration formats durations', () => {
  assert.equal(formatDuration(45_200), '45.2s');
  assert.equal(formatDuration(151_000), '2m31s');
});

test('verbose mode prints one line per file', () => {
  const stream = new FakeStream();
  const progress = new BuildProgress({
    total: 2,
    mode: 'verbose',
    outputDirLabel: 'dist/html/',
    stream,
    now: fakeClock().now,
  });
  progress.add('index.html', 563056);
  progress.add('about/index.html', 174);
  progress.finish();
  const lines = stream.lines();
  assert.equal(lines.length, 3);
  assert.match(lines[0], /549\.86 kB\s+dist\/html\/index\.html/);
  assert.match(lines[1], /0\.17 kB\s+dist\/html\/about\/index\.html/);
  assert.match(lines[2], /✓ 2 pages \(550\.03 kB\) in 0\.0s/);
});

test('progress mode in non-TTY prints milestone lines, not per-file lines', () => {
  const stream = new FakeStream({isTTY: false});
  const clock = fakeClock();
  const progress = new BuildProgress({
    total: 1000,
    mode: 'progress',
    stream,
    now: clock.now,
    intervalMs: 0,
  });
  for (let i = 0; i < 1000; i++) {
    clock.advance(10);
    progress.add(`page-${i}/index.html`, 1024);
  }
  progress.finish();
  const lines = stream.lines();
  // ~9 milestone lines (10%..90%) + summary + "largest pages:" + top 5.
  assert.isBelow(lines.length, 20);
  assert.match(lines[0], /100\/1000 pages \(10%\)/);
  const summary = lines.find((line) => line.includes('✓'));
  assert.isDefined(summary);
  assert.match(summary!, /1000 pages \(1000 kB\) in 10\.0s/);
});

test('progress mode non-TTY throttles milestone lines by interval', () => {
  const stream = new FakeStream({isTTY: false});
  const clock = fakeClock();
  const progress = new BuildProgress({
    total: 100,
    mode: 'progress',
    stream,
    now: clock.now,
    intervalMs: 5000,
  });
  // All pages complete instantly; only milestones spaced >= 5s apart print.
  for (let i = 0; i < 100; i++) {
    progress.add(`page-${i}/index.html`, 1024);
  }
  progress.finish();
  const milestoneLines = stream
    .lines()
    .filter((line) => line.includes('pages (') && !line.includes('✓'));
  assert.equal(milestoneLines.length, 0);
});

test('progress mode lists largest pages in summary', () => {
  const stream = new FakeStream({isTTY: false});
  const progress = new BuildProgress({
    total: 3,
    mode: 'progress',
    outputDirLabel: 'dist/html/',
    stream,
    now: fakeClock().now,
    summaryTopN: 2,
  });
  progress.add('small/index.html', 100);
  progress.add('large/index.html', 300000);
  progress.add('medium/index.html', 2000);
  progress.finish();
  const output = stream.output();
  const largeIdx = output.indexOf('large/index.html');
  const mediumIdx = output.indexOf('medium/index.html');
  assert.isAbove(largeIdx, -1);
  assert.isAbove(mediumIdx, largeIdx);
  assert.notInclude(output, 'small/index.html');
});

test('progress mode in TTY renders in-place and clears before summary', () => {
  const stream = new FakeStream({isTTY: true});
  const clock = fakeClock();
  const progress = new BuildProgress({
    total: 10,
    mode: 'progress',
    stream,
    now: clock.now,
    intervalMs: 0,
  });
  for (let i = 0; i < 10; i++) {
    clock.advance(100);
    progress.add(`page-${i}/index.html`, 1024);
  }
  const rawBeforeFinish = stream.chunks.join('');
  assert.include(rawBeforeFinish, '\r');
  progress.finish();
  // Summary appears on its own line, with progress bar frames cleared.
  const lines = stream.lines();
  const summary = lines.find((line) => line.includes('✓'));
  assert.isDefined(summary);
  assert.match(summary!, /10 pages \(10 kB\) in 1\.0s/);
});

test('quiet mode prints only the summary', () => {
  const stream = new FakeStream({isTTY: false});
  const progress = new BuildProgress({
    total: 50,
    mode: 'quiet',
    stream,
    now: fakeClock().now,
  });
  for (let i = 0; i < 50; i++) {
    progress.add(`page-${i}/index.html`, 2048);
  }
  progress.finish();
  const lines = stream.lines();
  assert.equal(lines.length, 1);
  assert.match(lines[0], /✓ 50 pages \(100 kB\) in 0\.0s/);
});

test('abort suppresses the summary and clears the progress line', () => {
  const stream = new FakeStream({isTTY: true});
  const progress = new BuildProgress({
    total: 10,
    mode: 'progress',
    stream,
    now: fakeClock().now,
    intervalMs: 0,
  });
  progress.add('page/index.html', 1024);
  progress.abort();
  progress.finish();
  assert.notInclude(stream.output(), '✓');
});

test('intercepted logs print above the TTY progress bar', async () => {
  const stream = new FakeStream({isTTY: true});
  const stderr = new FakeStream({isTTY: true});
  const clock = fakeClock();
  const progress = new BuildProgress({
    total: 10,
    mode: 'progress',
    stream,
    interceptStreams: [stream, stderr],
    now: clock.now,
    intervalMs: 0,
  });
  clock.advance(100);
  progress.add('page-0/index.html', 1024);
  // Simulate user code logging mid-build (e.g. console.log during render).
  stream.write('user log\n');
  stderr.write('warning log\n');
  // The bar is cleared before each foreign log line.
  const raw = stream.chunks.join('');
  assert.include(raw, '\r\x1b[2Kuser log\n');
  assert.equal(stderr.output(), 'warning log\n');
  // The bar redraws (async) after foreign output.
  await new Promise((resolve) => setTimeout(resolve, 5));
  const lastChunk = stripAnsi(stream.chunks[stream.chunks.length - 1]);
  assert.include(lastChunk, '1/10 pages');
  progress.finish();
  // Streams are restored: writes no longer trigger bar redraws.
  const numChunks = stream.chunks.length;
  stream.write('after\n');
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(stream.chunks.length, numChunks + 1);
});

test('intercepted partial lines are terminated before the bar redraws', async () => {
  const stream = new FakeStream({isTTY: true});
  const clock = fakeClock();
  const progress = new BuildProgress({
    total: 10,
    mode: 'progress',
    stream,
    interceptStreams: [stream],
    now: clock.now,
    intervalMs: 0,
  });
  clock.advance(100);
  progress.add('page-0/index.html', 1024);
  stream.write('no trailing newline');
  await new Promise((resolve) => setTimeout(resolve, 5));
  const output = stream.output();
  // The partial line is kept on its own line, with the bar below it.
  assert.include(output, 'no trailing newline\n');
  progress.finish();
});
