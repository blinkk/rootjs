import {loadRootConfig} from '@blinkk/root/node';
import {RootCMSClient} from '../core/client.js';
import {ClientApiInfo, getClientApiInfo} from './client-reflect.js';
import {convertForExport, convertFirestoreTypes} from './utils.js';

export interface ClientMethodsOptions {
  /** Output machine-readable JSON instead of formatted help text. */
  json?: boolean;
  /** Include referenced type/interface definitions in the output. */
  types?: boolean;
}

/**
 * Runs a single method on the RootCMSClient with JSON-encoded arguments and
 * prints the result as a JSON envelope to stdout.
 *
 * The result envelope is one of:
 *   {"ok": true, "result": <json value>}
 *   {"ok": false, "error": "<message>"}
 *
 * Usage:
 *   root-cms client.call <method> [jsonArgs]
 *   root-cms client.call getDoc '["Pages", "home", {"mode": "draft"}]'
 *   root-cms client.call publishScheduledDocs
 *   echo '["Pages", "home", {"mode": "draft"}]' | root-cms client.call getDoc -
 */
export async function clientCall(method: string, jsonArgs: string | undefined) {
  try {
    const args = await parseJsonArgs(jsonArgs);

    const methods = getClientApiInfo().methods;
    const methodInfo = methods.find((m) => m.name === method);
    if (!methodInfo) {
      const available = methods.map((m) => m.name).join(', ');
      throw new Error(
        `unknown method: "${method}". Run \`root-cms client.methods\` to ` +
          `list available methods. Available: ${available}`
      );
    }

    const rootDir = process.cwd();
    const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
    const client = new RootCMSClient(rootConfig);

    const fn = (client as any)[method];
    if (typeof fn !== 'function') {
      throw new Error(`"${method}" is not a callable method on RootCMSClient`);
    }

    // Convert any serialized firestore types (Timestamp/GeoPoint/DocumentRef)
    // in the input args back into real firestore objects.
    const callArgs = convertFirestoreTypes(args, client.db);
    const rawResult = await fn.apply(client, callArgs);

    // Convert firestore types in the result into JSON-serializable values.
    const result = convertForExport(rawResult);
    process.stdout.write(
      JSON.stringify({ok: true, result: result ?? null}) + '\n'
    );
  } catch (err: any) {
    const message = err?.message || String(err);
    process.stdout.write(JSON.stringify({ok: false, error: message}) + '\n');
    process.exitCode = 1;
  }
}

/**
 * Prints help text describing every public method available on the
 * RootCMSClient so that an AI agent (or human) can discover functionality.
 *
 * Usage:
 *   root-cms client.methods
 *   root-cms client.methods --json
 *   root-cms client.methods --types
 */
export async function clientMethods(options?: ClientMethodsOptions) {
  const info = getClientApiInfo();

  if (options?.json) {
    const payload: ClientApiInfo = {
      methods: info.methods,
      types: options.types ? info.types : [],
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    return;
  }

  const lines: string[] = [];
  lines.push('RootCMSClient methods');
  lines.push('=====================');
  lines.push('');
  lines.push('Call any method via:');
  lines.push('  root-cms client.call <method> <jsonArgs>');
  lines.push('');
  lines.push('Where <jsonArgs> is a JSON array of positional arguments, e.g.:');
  lines.push(
    '  root-cms client.call getDoc \'["Pages", "home", {"mode": "draft"}]\''
  );
  lines.push('');
  for (const method of info.methods) {
    lines.push(method.signature);
    if (method.description) {
      for (const line of method.description.split('\n')) {
        lines.push(`    ${line}`);
      }
    }
    lines.push('');
  }

  if (options?.types && info.types.length > 0) {
    lines.push('Referenced types');
    lines.push('================');
    lines.push('');
    for (const type of info.types) {
      if (type.description) {
        for (const line of type.description.split('\n')) {
          lines.push(`// ${line}`);
        }
      }
      lines.push(type.declaration);
      lines.push('');
    }
  }

  process.stdout.write(lines.join('\n') + '\n');
}

/**
 * Parses the JSON args string into an array of positional args.
 *
 * If `jsonArgs` is omitted, the method is called with no arguments. Pass `-`
 * to read the JSON args from stdin (e.g. `echo '[...]' | client.call m -`).
 */
async function parseJsonArgs(jsonArgs: string | undefined): Promise<any[]> {
  let raw = jsonArgs;
  if (raw === '-') {
    raw = await readStdin();
  }
  if (raw === undefined || raw.trim() === '') {
    return [];
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(
      `invalid JSON args: ${err?.message || String(err)}. Expected a JSON ` +
        'array of positional arguments, e.g. \'["Pages", "home"]\'',
      {cause: err}
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      'JSON args must be an array of positional arguments, e.g. ' +
        '\'["Pages", "home", {"mode": "draft"}]\''
    );
  }
  return parsed;
}

/**
 * Reads all data from stdin as a string.
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}
