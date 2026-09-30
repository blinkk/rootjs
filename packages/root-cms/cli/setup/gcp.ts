import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type GcpErrorCode =
  | 'ENOENT'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'PERMISSION_DENIED'
  | 'UNAUTHENTICATED'
  | 'UNKNOWN';

/** Error thrown by a {@link GcpClient} call, with a classified code. */
export class GcpError extends Error {
  code: GcpErrorCode;
  detail: string;

  constructor(code: GcpErrorCode, message: string, detail = '') {
    super(message);
    this.name = 'GcpError';
    this.code = code;
    this.detail = detail;
  }
}

/** Returns true if `err` is a {@link GcpError} with the given code. */
export function isGcpError(err: unknown, code: GcpErrorCode): boolean {
  return err instanceof GcpError && err.code === code;
}

/** A REST request to a Google API. */
export interface GcpRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: string;
  body?: unknown;
  /**
   * GCP project to bill the request's quota to. Several Firebase and Identity
   * Toolkit APIs reject user credentials without one.
   */
  quotaProject?: string;
}

/**
 * Everything the setup wizard does against Google Cloud goes through this
 * interface, so tests can swap in a fake and never touch real resources.
 */
export interface GcpClient {
  /** Runs `gcloud` with the given args and returns stdout. */
  gcloud(args: string[], options?: {input?: string}): Promise<string>;
  /** Runs `gcloud` attached to the terminal (e.g. for browser logins). */
  gcloudInteractive(args: string[]): Promise<void>;
  /** Sends an authenticated REST request and returns the parsed JSON body. */
  request<T = any>(req: GcpRequest): Promise<T>;
  /** Returns the quota project in the local ADC file, if any. */
  getAdcQuotaProject(): Promise<string | undefined>;
  /** Fetches a public URL and returns its body as text. */
  fetchText(url: string): Promise<string>;
  /** Runs a local command (not gcloud) and returns stdout. */
  exec(
    cmd: string,
    args: string[],
    options: {cwd: string; input?: string}
  ): Promise<string>;
}

/** Runs `gcloud` and parses its `--format=json` output. */
export async function gcloudJson<T = any>(
  gcp: GcpClient,
  args: string[]
): Promise<T> {
  const out = await gcp.gcloud([...args, '--format=json']);
  const trimmed = out.trim();
  return (trimmed ? JSON.parse(trimmed) : null) as T;
}

/** Default {@link GcpClient} backed by the gcloud CLI and `fetch`. */
export class GcloudClient implements GcpClient {
  private accessToken?: {token: string; expiresAt: number};

  gcloud(args: string[], options: {input?: string} = {}): Promise<string> {
    return run('gcloud', args, {input: options.input});
  }

  gcloudInteractive(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('gcloud', args, {stdio: 'inherit'});
      child.on('error', (err: any) => reject(toSpawnError('gcloud', err)));
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new GcpError('UNKNOWN', `gcloud ${args.join(' ')} failed (${code})`)
          );
        }
      });
    });
  }

  async request<T = any>(req: GcpRequest): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.getAccessToken()}`,
    };
    if (req.quotaProject) {
      headers['x-goog-user-project'] = req.quotaProject;
    }
    let body: string | undefined;
    if (req.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(req.body);
    }
    const res = await fetch(req.url, {
      method: req.method || 'GET',
      headers,
      body,
    });
    const text = await res.text();
    if (!res.ok) {
      throw classifyHttpError(res.status, text, req);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  async getAdcQuotaProject(): Promise<string | undefined> {
    const configDir =
      process.env.CLOUDSDK_CONFIG ||
      (process.platform === 'win32'
        ? path.join(process.env.APPDATA || '', 'gcloud')
        : path.join(os.homedir(), '.config', 'gcloud'));
    const adcPath =
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      path.join(configDir, 'application_default_credentials.json');
    try {
      const data = JSON.parse(await fs.promises.readFile(adcPath, 'utf8'));
      return data.quota_project_id || undefined;
    } catch {
      return undefined;
    }
  }

  async fetchText(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new GcpError('UNKNOWN', `GET ${url} failed (${res.status})`);
    }
    return res.text();
  }

  exec(
    cmd: string,
    args: string[],
    options: {cwd: string; input?: string}
  ): Promise<string> {
    return run(cmd, args, options);
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now()) {
      return this.accessToken.token;
    }
    const token = (await this.gcloud(['auth', 'print-access-token'])).trim();
    // Tokens last an hour; refresh well before that.
    this.accessToken = {token, expiresAt: Date.now() + 30 * 60 * 1000};
    return token;
  }
}

function run(
  cmd: string,
  args: string[],
  options: {cwd?: string; input?: string}
): Promise<string> {
  return new Promise((resolve, reject) => {
    // No shell: args are passed as an array so ids can't be interpreted by a
    // shell, and secret values only ever travel over stdin.
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err: any) => reject(toSpawnError(cmd, err)));
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(classifyText(stderr || stdout, `${cmd} ${args[0] || ''}`));
      }
    });
    child.stdin.end(options.input ?? '');
  });
}

function toSpawnError(cmd: string, err: any): Error {
  if (err?.code === 'ENOENT') {
    if (cmd === 'gcloud') {
      return new GcpError(
        'ENOENT',
        'The Google Cloud CLI (gcloud) was not found. Install it from ' +
          'https://cloud.google.com/sdk/docs/install and run this again.'
      );
    }
    return new GcpError('ENOENT', `${cmd} was not found`);
  }
  return err;
}

function classifyText(text: string, what: string): GcpError {
  const trimmed = text.trim();
  const message = trimmed || `${what} failed`;
  if (/NOT_FOUND|was not found|does not exist|not found/i.test(trimmed)) {
    return new GcpError('NOT_FOUND', message, trimmed);
  }
  if (/ALREADY_EXISTS|already exists/i.test(trimmed)) {
    return new GcpError('ALREADY_EXISTS', message, trimmed);
  }
  if (
    /UNAUTHENTICATED|reauth|gcloud auth login|not authenticated/i.test(trimmed)
  ) {
    return new GcpError('UNAUTHENTICATED', message, trimmed);
  }
  if (/PERMISSION_DENIED|permission|forbidden/i.test(trimmed)) {
    return new GcpError('PERMISSION_DENIED', message, trimmed);
  }
  return new GcpError('UNKNOWN', message, trimmed);
}

function classifyHttpError(
  status: number,
  text: string,
  req: GcpRequest
): GcpError {
  let message = text;
  try {
    message = JSON.parse(text)?.error?.message || text;
  } catch {
    // Not JSON; keep the raw body.
  }
  const summary = `${req.method || 'GET'} ${req.url} (${status}): ${message}`;
  if (status === 404) {
    return new GcpError('NOT_FOUND', summary, text);
  }
  if (status === 409) {
    return new GcpError('ALREADY_EXISTS', summary, text);
  }
  if (status === 401) {
    return new GcpError('UNAUTHENTICATED', summary, text);
  }
  if (status === 403) {
    return new GcpError('PERMISSION_DENIED', summary, text);
  }
  return new GcpError('UNKNOWN', summary, text);
}
