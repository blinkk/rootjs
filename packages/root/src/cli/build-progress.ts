import {cyan, dim, green} from 'kleur/colors';

/**
 * Log output modes for `root build`:
 *
 * - `progress` (default): shows a progress indicator while pages render. In
 *   interactive terminals this is a live single-line progress bar; in
 *   non-interactive environments (e.g. CI) a progress line is printed at
 *   ~10% intervals. A short summary (with the largest output files) is
 *   printed at the end.
 * - `verbose`: prints one line per output file (legacy behavior).
 * - `quiet`: prints only the final summary line.
 */
export type BuildLogMode = 'progress' | 'verbose' | 'quiet';

export function parseBuildLogMode(value: unknown): BuildLogMode {
  if (value === undefined || value === null || value === '') {
    return 'progress';
  }
  if (value === 'progress' || value === 'verbose' || value === 'quiet') {
    return value;
  }
  throw new Error(
    `invalid --log value: "${value}" (expected "progress", "verbose", or "quiet")`
  );
}

/** Formats a byte count for display, e.g. `549.86 kB`. */
export function formatBytes(bytes: number): string {
  const k = 1024;
  if (bytes < k) {
    return (bytes / k).toFixed(2) + ' kB';
  }
  const units = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
}

/** Formats a duration in ms for display, e.g. `45.2s` or `2m31s`. */
export function formatDuration(ms: number): string {
  const secs = ms / 1000;
  if (secs < 60) {
    return `${secs.toFixed(1)}s`;
  }
  const mins = Math.floor(secs / 60);
  const rem = Math.round(secs - mins * 60);
  return `${mins}m${String(rem).padStart(2, '0')}s`;
}

interface WritableStreamLike {
  write(str: string): unknown;
  isTTY?: boolean;
}

export interface BuildProgressOptions {
  /** Total number of files expected. */
  total: number;
  /** Log output mode. */
  mode: BuildLogMode;
  /** Label for items in progress lines. Defaults to "pages". */
  itemLabel?: string;
  /** Path prefix shown before file paths, e.g. `dist/html/`. */
  outputDirLabel?: string;
  /** Output stream. Defaults to `process.stdout`. */
  stream?: WritableStreamLike;
  /** Clock function (injectable for tests). Defaults to `Date.now`. */
  now?: () => number;
  /**
   * Minimum interval between progress updates, in ms. Defaults to 80ms for
   * interactive terminals and 5000ms otherwise.
   */
  intervalMs?: number;
  /** Number of largest files to list in the summary. Defaults to 5. */
  summaryTopN?: number;
}

const BAR_WIDTH = 20;

/**
 * Reports progress for build output files.
 *
 * Tracks completed files and bytes written, and renders progress according
 * to the configured `BuildLogMode`. Designed to keep CI logs readable: a
 * 10,000-page build emits ~10 progress lines instead of 10,000.
 */
export class BuildProgress {
  private readonly total: number;
  private readonly mode: BuildLogMode;
  private readonly itemLabel: string;
  private readonly outputDirLabel: string;
  private readonly stream: WritableStreamLike;
  private readonly now: () => number;
  private readonly intervalMs: number;
  private readonly summaryTopN: number;
  private readonly isTTY: boolean;
  private readonly startedAt: number;

  private completed = 0;
  private totalBytes = 0;
  private files: Array<{path: string; size: number}> = [];
  private lastPrintAt = 0;
  private lastMilestone = 0;
  private ttyLineActive = false;
  private done = false;

  constructor(options: BuildProgressOptions) {
    this.total = options.total;
    this.mode = options.mode;
    this.itemLabel = options.itemLabel ?? 'pages';
    this.outputDirLabel = options.outputDirLabel ?? '';
    this.stream = options.stream ?? process.stdout;
    this.now = options.now ?? Date.now;
    this.isTTY = !!this.stream.isTTY;
    this.intervalMs = options.intervalMs ?? (this.isTTY ? 80 : 5000);
    this.summaryTopN = options.summaryTopN ?? 5;
    this.startedAt = this.now();
  }

  /** Records a completed output file. */
  add(outputFile: string, sizeBytes: number) {
    this.completed += 1;
    this.totalBytes += sizeBytes;
    this.files.push({path: outputFile, size: sizeBytes});
    if (this.mode === 'verbose') {
      const paddedSize = formatBytes(sizeBytes).padStart(9, ' ');
      this.println(
        `  ${dim(paddedSize)}  ${dim(this.outputDirLabel)}${cyan(outputFile)}`
      );
      return;
    }
    if (this.mode === 'progress') {
      this.maybePrintProgress();
    }
  }

  /** Clears any in-place progress line (call before printing errors). */
  abort() {
    this.clearTtyLine();
    this.done = true;
  }

  /** Prints the final summary. */
  finish() {
    if (this.done) {
      return;
    }
    this.done = true;
    this.clearTtyLine();
    const elapsed = formatDuration(this.now() - this.startedAt);
    const summary = `${this.completed} ${this.itemLabel} (${formatBytes(
      this.totalBytes
    )}) in ${elapsed}`;
    this.println(`  ${green('✓')} ${summary}`);
    if (this.mode === 'progress' && this.summaryTopN > 0) {
      const largest = [...this.files]
        .sort((a, b) => b.size - a.size)
        .slice(0, this.summaryTopN);
      if (largest.length > 0) {
        this.println(`  ${dim(`largest ${this.itemLabel}:`)}`);
        for (const file of largest) {
          const paddedSize = formatBytes(file.size).padStart(9, ' ');
          this.println(
            `  ${dim(paddedSize)}  ${dim(this.outputDirLabel)}${cyan(
              file.path
            )}`
          );
        }
      }
    }
  }

  private maybePrintProgress() {
    const now = this.now();
    if (this.isTTY) {
      // Live single-line progress bar, throttled to avoid excessive redraws.
      // The final state is always rendered by `finish()`.
      if (now - this.lastPrintAt < this.intervalMs) {
        return;
      }
      this.lastPrintAt = now;
      this.renderTtyLine(now);
      return;
    }
    // Non-interactive (e.g. CI): print a progress line at each ~10%
    // milestone, throttled to at most one line per interval. The 100%
    // state is reported by `finish()`.
    const milestone = Math.floor((this.completed / this.total) * 10);
    if (milestone <= this.lastMilestone || this.completed === this.total) {
      return;
    }
    if (now - this.lastPrintAt < this.intervalMs) {
      return;
    }
    this.lastMilestone = milestone;
    this.lastPrintAt = now;
    const pct = Math.floor((this.completed / this.total) * 100);
    this.println(
      `  ${this.completed}/${this.total} ${this.itemLabel} (${pct}%) · ${formatBytes(this.totalBytes)} · ${formatDuration(now - this.startedAt)}${this.eta(now)}`
    );
  }

  private renderTtyLine(now: number) {
    const ratio = this.total > 0 ? this.completed / this.total : 0;
    const filled = Math.round(ratio * BAR_WIDTH);
    const bar = '▕' + '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled) + '▏';
    const pct = String(Math.floor(ratio * 100)).padStart(3, ' ');
    const line = `  ${bar} ${pct}% · ${this.completed}/${this.total} ${this.itemLabel} · ${formatBytes(this.totalBytes)} · ${formatDuration(now - this.startedAt)}${this.eta(now)}`;
    this.stream.write(`\r\x1b[2K${line}`);
    this.ttyLineActive = true;
  }

  /** Returns an " · eta 12.3s" suffix once enough progress exists to estimate. */
  private eta(now: number): string {
    if (this.completed < 10 || this.completed / this.total < 0.05) {
      return '';
    }
    const elapsed = now - this.startedAt;
    const remaining =
      (elapsed / this.completed) * (this.total - this.completed);
    return ` · eta ${formatDuration(remaining)}`;
  }

  private clearTtyLine() {
    if (this.ttyLineActive) {
      this.stream.write('\r\x1b[2K');
      this.ttyLineActive = false;
    }
  }

  private println(line: string) {
    this.clearTtyLine();
    this.stream.write(line + '\n');
  }
}
