import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Worker} from 'node:worker_threads';

import {
  BuildPageResult,
  BuildPageTask,
  BuildWorkerRequest,
  BuildWorkerResponse,
} from './build-page.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface BuildWorkerPoolOptions {
  /** Number of worker threads. */
  numWorkers: number;
  /**
   * Number of pages each worker renders concurrently. Rendering is async, so
   * pages that wait on I/O (e.g. CMS fetches in `getStaticProps()`) don't
   * block other pages on the same thread.
   */
  workerConcurrency: number;
  /** Project root dir, passed to each worker. */
  rootDir: string;
  /** Build mode (e.g. "production"), passed to each worker. */
  mode: string;
}

interface PendingTask {
  id: number;
  task: BuildPageTask;
  resolve: (result: BuildPageResult) => void;
  reject: (err: Error) => void;
}

export class BuildPageError extends Error {
  urlPath: string;
  params: Record<string, string>;
  routeSrc?: string;
  workerError: string;

  constructor(
    urlPath: string,
    params: Record<string, string>,
    routeSrc: string | undefined,
    workerError: string
  ) {
    super(
      `BuildError: ${urlPath} (${routeSrc || 'unknown route'}) failed to build.`
    );
    this.urlPath = urlPath;
    this.params = params;
    this.routeSrc = routeSrc;
    this.workerError = workerError;
  }
}

class BuildWorker {
  private worker: Worker;
  private pool: BuildWorkerPool;
  private concurrency: number;
  private inFlight = new Map<number, PendingTask>();
  private isReady = false;
  ready: Promise<void>;

  constructor(pool: BuildWorkerPool, options: BuildWorkerPoolOptions) {
    this.pool = pool;
    this.concurrency = options.workerConcurrency;
    this.worker = new Worker(path.resolve(__dirname, './build-worker.js'), {
      workerData: {rootDir: options.rootDir, mode: options.mode},
    });
    let onReady!: () => void;
    let onFailed!: (err: Error) => void;
    this.ready = new Promise<void>((resolve, reject) => {
      onReady = resolve;
      onFailed = reject;
    });
    this.worker.on('message', (msg: BuildWorkerResponse) => {
      if (msg.type === 'ready') {
        this.isReady = true;
        onReady();
        this.next();
      } else if (msg.type === 'result') {
        const pending = this.inFlight.get(msg.id);
        this.inFlight.delete(msg.id);
        pending?.resolve(msg.result);
        this.next();
      } else if (msg.type === 'error') {
        const pending = this.inFlight.get(msg.id);
        this.inFlight.delete(msg.id);
        pending?.reject(
          new BuildPageError(msg.urlPath, msg.params, msg.routeSrc, msg.error)
        );
        this.next();
      } else if (msg.type === 'fatal') {
        const err = new Error(`build worker failed: ${msg.error}`);
        onFailed(err);
        this.failAll(err);
      }
    });
    this.worker.on('error', (err) => {
      onFailed(err);
      this.failAll(err);
    });
    this.worker.on('exit', (code) => {
      if (code !== 0) {
        const err = new Error(`build worker exited with code ${code}`);
        onFailed(err);
        this.failAll(err);
      }
    });
  }

  private failAll(err: Error) {
    const pendingTasks = Array.from(this.inFlight.values());
    this.inFlight.clear();
    pendingTasks.forEach((pending) => pending.reject(err));
  }

  /** Pulls tasks off the pool's queue until at max concurrency. */
  next() {
    if (!this.isReady) {
      return;
    }
    while (this.inFlight.size < this.concurrency) {
      const pending = this.pool.dequeue();
      if (!pending) {
        return;
      }
      this.inFlight.set(pending.id, pending);
      const req: BuildWorkerRequest = {
        type: 'render',
        id: pending.id,
        task: pending.task,
      };
      this.worker.postMessage(req);
    }
  }

  async terminate() {
    await this.worker.terminate();
  }
}

/**
 * A pool of worker threads that render SSG pages in parallel. Each worker
 * loads the site's built server bundle (`dist/server/render.js`) and renders
 * pages independently, allowing the build to utilize multiple CPU cores.
 */
export class BuildWorkerPool {
  private workers: BuildWorker[] = [];
  private queue: PendingTask[] = [];
  private nextTaskId = 0;

  constructor(options: BuildWorkerPoolOptions) {
    for (let i = 0; i < options.numWorkers; i++) {
      this.workers.push(new BuildWorker(this, options));
    }
  }

  /** Waits for all workers to finish initializing. */
  async ready() {
    await Promise.all(this.workers.map((worker) => worker.ready));
  }

  /** Schedules a page build and resolves when the page finishes. */
  run(task: BuildPageTask): Promise<BuildPageResult> {
    return new Promise<BuildPageResult>((resolve, reject) => {
      this.queue.push({id: this.nextTaskId++, task, resolve, reject});
      // Wake up any workers with spare capacity.
      this.workers.forEach((worker) => worker.next());
    });
  }

  dequeue(): PendingTask | undefined {
    return this.queue.shift();
  }

  async terminate() {
    await Promise.all(this.workers.map((worker) => worker.terminate()));
  }
}
