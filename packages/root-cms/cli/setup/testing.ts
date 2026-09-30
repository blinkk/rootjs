import {Logger} from './context.js';
import {GcpClient, GcpError, GcpRequest} from './gcp.js';
import {Prompter, SelectChoice, TextPromptOptions} from './prompter.js';

type Handler = (call: FakeCall) => unknown;

export interface FakeCall {
  kind: 'gcloud' | 'request' | 'exec' | 'fetch' | 'interactive';
  /** `gcloud` args joined with spaces, `METHOD url`, or the command line. */
  key: string;
  args?: string[];
  req?: GcpRequest;
  input?: string;
}

/**
 * Fake {@link GcpClient} for tests. Routes are matched by prefix against the
 * call key (longest prefix wins); a route returning a {@link GcpError} rejects with it. Unrouted
 * calls throw so tests fail loudly instead of hitting real GCP.
 */
export class FakeGcp implements GcpClient {
  calls: FakeCall[] = [];
  adcQuotaProject?: string;
  private routes: Array<[string, Handler]> = [];

  on(prefix: string, handler: Handler | unknown): this {
    this.routes.push([
      prefix,
      typeof handler === 'function' ? (handler as Handler) : () => handler,
    ]);
    return this;
  }

  /** Keys of calls that change something (anything but reads). */
  get mutations(): string[] {
    return this.calls.filter((c) => isMutation(c)).map((c) => c.key);
  }

  async gcloud(args: string[], options: {input?: string} = {}) {
    return this.dispatch({
      kind: 'gcloud',
      key: `gcloud ${args.join(' ')}`,
      args,
      input: options.input,
    }) as Promise<string>;
  }

  async gcloudInteractive(args: string[]) {
    await this.dispatch({
      kind: 'interactive',
      key: `gcloud ${args.join(' ')}`,
      args,
    });
  }

  async request<T>(req: GcpRequest): Promise<T> {
    return this.dispatch({
      kind: 'request',
      key: `${req.method || 'GET'} ${req.url}`,
      req,
    }) as Promise<T>;
  }

  async getAdcQuotaProject() {
    return this.adcQuotaProject;
  }

  async fetchText(url: string) {
    return this.dispatch({
      kind: 'fetch',
      key: `FETCH ${url}`,
    }) as Promise<string>;
  }

  async exec(
    cmd: string,
    args: string[],
    options: {cwd: string; input?: string}
  ) {
    return this.dispatch({
      kind: 'exec',
      key: `EXEC ${args.slice(1).join(' ')}`,
      args,
      input: options.input,
    }) as Promise<string>;
  }

  private async dispatch(call: FakeCall): Promise<unknown> {
    this.calls.push(call);
    // The longest matching prefix wins; on a tie, the route added last wins
    // so tests can override defaults.
    let best: [string, Handler] | undefined;
    for (const route of this.routes) {
      if (
        call.key.startsWith(route[0]) &&
        (!best || route[0].length >= best[0].length)
      ) {
        best = route;
      }
    }
    if (!best) {
      throw new Error(`unexpected call: ${call.key}`);
    }
    const result = best[1](call);
    if (result instanceof GcpError) {
      throw result;
    }
    return result;
  }
}

function isMutation(call: FakeCall): boolean {
  if (call.kind === 'request') {
    return (call.req?.method || 'GET') !== 'GET';
  }
  if (call.kind === 'exec' || call.kind === 'interactive') {
    return true;
  }
  if (call.kind === 'gcloud') {
    const readOnly = [
      'version',
      'auth list',
      'auth print-access-token',
      'auth application-default print-access-token',
      'projects describe',
      'projects list',
      'projects get-iam-policy',
      'billing projects describe',
      'billing accounts list',
      'services list',
      'firestore databases describe',
      'storage buckets describe',
      'storage buckets get-iam-policy',
      'iam roles describe',
      'iam service-accounts describe',
    ];
    const cmd = (call.args || []).join(' ');
    return !readOnly.some((prefix) => cmd.startsWith(prefix));
  }
  return false;
}

/** Scripted {@link Prompter}: answers are keyed by a substring of the question. */
export class FakePrompter implements Prompter {
  asked: string[] = [];
  private answers: Array<[string, string | boolean]>;

  constructor(answers: Record<string, string | boolean> = {}) {
    this.answers = Object.entries(answers);
  }

  async text(message: string, options: TextPromptOptions = {}) {
    this.asked.push(message);
    const answer = this.find(message);
    const value = typeof answer === 'string' ? answer : options.default;
    if (value === undefined) {
      throw new Error(`no answer for "${message}"`);
    }
    const error = options.validate?.(value);
    if (error) {
      throw new Error(`invalid answer for "${message}": ${error}`);
    }
    return value;
  }

  async confirm(message: string, defaultValue: boolean) {
    this.asked.push(message);
    const answer = this.find(message);
    return typeof answer === 'boolean' ? answer : defaultValue;
  }

  async select<T extends string>(
    message: string,
    choices: SelectChoice<T>[],
    defaultValue?: T
  ) {
    this.asked.push(message);
    const answer = this.find(message);
    if (typeof answer === 'string') {
      const choice = choices.find((c) => c.value === answer);
      if (!choice) {
        throw new Error(`"${answer}" is not a choice for "${message}"`);
      }
      return choice.value;
    }
    return defaultValue ?? choices[0].value;
  }

  async pause(message: string) {
    this.asked.push(message);
  }

  private find(message: string) {
    return this.answers.find(([key]) => message.includes(key))?.[1];
  }
}

/** Logger that records lines instead of printing them. */
export function memoryLogger(): Logger & {lines: string[]} {
  const lines: string[] = [];
  return {
    lines,
    step: (m) => lines.push(`# ${m}`),
    info: (m) => lines.push(m),
    ok: (m) => lines.push(`ok ${m}`),
    warn: (m) => lines.push(`warn ${m}`),
  };
}
