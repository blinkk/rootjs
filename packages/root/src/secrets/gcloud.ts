import {spawn} from 'node:child_process';

export type GcloudErrorCode =
  | 'ENOENT'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'PERMISSION_DENIED'
  | 'UNAUTHENTICATED'
  | 'UNKNOWN';

/** Error thrown when a `gcloud` invocation fails, with a classified code. */
export class GcloudError extends Error {
  code: GcloudErrorCode;
  stderr: string;

  constructor(code: GcloudErrorCode, message: string, stderr = '') {
    super(message);
    this.name = 'GcloudError';
    this.code = code;
    this.stderr = stderr;
  }
}

/**
 * Spawns `gcloud` with the given args (no shell — args are passed as an array,
 * so secret names and project ids can never be interpreted by a shell). Any
 * `input` is written to stdin (used to pass secret payloads, never argv).
 * Resolves with stdout; rejects with a {@link GcloudError} on failure.
 */
export function runGcloud(
  args: string[],
  options: {input?: string} = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('gcloud', args, {
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
    child.on('error', (err: any) => {
      if (err.code === 'ENOENT') {
        reject(
          new GcloudError(
            'ENOENT',
            'The Google Cloud CLI (gcloud) was not found. Install it: ' +
              'https://cloud.google.com/sdk/docs/install'
          )
        );
        return;
      }
      reject(err);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(classifyError(stderr));
    });
    if (options.input !== undefined) {
      child.stdin.end(options.input);
    } else {
      child.stdin.end();
    }
  });
}

/**
 * Reads the latest version of a GSM secret and parses it as a JSON object of
 * `{ENV_NAME: value}`. A missing secret (`NOT_FOUND`) or empty payload resolves
 * to `{}` so callers can treat "never created" the same as "empty".
 */
export async function accessSecretJson(
  gsmKey: string,
  project: string
): Promise<Record<string, string>> {
  let stdout: string;
  try {
    stdout = await runGcloud([
      'secrets',
      'versions',
      'access',
      'latest',
      '--secret',
      gsmKey,
      '--project',
      project,
    ]);
  } catch (err) {
    if (err instanceof GcloudError && err.code === 'NOT_FOUND') {
      return {};
    }
    throw err;
  }
  const trimmed = stdout.trim();
  if (!trimmed) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(
      `secret "${gsmKey}" does not contain valid JSON (expected an object of ` +
        'env-name to value)'
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`secret "${gsmKey}" must be a JSON object`);
  }
  return parsed as Record<string, string>;
}

/**
 * Writes a JSON `{ENV_NAME: value}` object as a new version of a GSM secret,
 * creating the secret first if it doesn't yet exist. The payload is passed via
 * stdin, never as a command-line argument.
 */
export async function writeSecretJson(
  gsmKey: string,
  project: string,
  data: Record<string, string>
): Promise<void> {
  await ensureSecret(gsmKey, project);
  await runGcloud(
    [
      'secrets',
      'versions',
      'add',
      gsmKey,
      '--project',
      project,
      '--data-file=-',
    ],
    {input: JSON.stringify(data, null, 2)}
  );
}

/** Creates a GSM secret, tolerating the case where it already exists. */
async function ensureSecret(gsmKey: string, project: string): Promise<void> {
  try {
    await runGcloud([
      'secrets',
      'create',
      gsmKey,
      '--project',
      project,
      '--replication-policy',
      'automatic',
      '--labels',
      'managed-by=root',
    ]);
  } catch (err) {
    if (
      err instanceof GcloudError &&
      (err.code === 'ALREADY_EXISTS' || /already exists/i.test(err.stderr))
    ) {
      return;
    }
    throw err;
  }
}

/** Maps gcloud stderr to a classified, user-actionable error. */
function classifyError(stderr: string): GcloudError {
  const text = stderr.trim();
  if (/NOT_FOUND|was not found|does not exist/i.test(text)) {
    return new GcloudError('NOT_FOUND', text || 'not found', stderr);
  }
  if (/ALREADY_EXISTS|already exists/i.test(text)) {
    return new GcloudError('ALREADY_EXISTS', text || 'already exists', stderr);
  }
  if (/PERMISSION_DENIED|permission|forbidden|403/i.test(text)) {
    return new GcloudError(
      'PERMISSION_DENIED',
      'Permission denied by Google Cloud. Ensure your account has the right ' +
        'IAM roles (roles/secretmanager.admin to write, ' +
        'roles/secretmanager.secretAccessor to read).\n' +
        text,
      stderr
    );
  }
  if (/UNAUTHENTICATED|not authenticated|reauth|login/i.test(text)) {
    return new GcloudError(
      'UNAUTHENTICATED',
      'Not authenticated with Google Cloud. Run `gcloud auth login`.\n' + text,
      stderr
    );
  }
  return new GcloudError('UNKNOWN', text || 'gcloud command failed', stderr);
}
