/**
 * Client-side utility for calling the `/cms/api/ai.generate` endpoint with
 * support for SSE streaming responses.
 *
 * Usage (non-streaming):
 * ```ts
 * const client = new AiClient();
 * const response = await client.generate({
 *   messages: [{role: 'user', content: 'Hello!'}],
 * });
 * console.log(response.text);
 * ```
 *
 * Usage (streaming):
 * ```ts
 * const client = new AiClient();
 * await client.generateStream(
 *   {messages: [{role: 'user', content: 'Hello!'}]},
 *   (chunk) => console.log(chunk.text),
 * );
 * ```
 */

/** Supported AI providers. */
export type AiProvider = 'gemini' | 'openai' | 'anthropic';

/** Roles used in AI message history. */
export type AiMessageRole = 'system' | 'user' | 'assistant';

/** A single message in a conversation. */
export interface AiMessage {
  role: AiMessageRole;
  content: string;
}

/** Optional generation config. */
export interface AiGenerateConfig {
  /** Controls randomness. 0 = deterministic, 1 = creative. */
  temperature?: number;
  /** Maximum number of tokens to generate. */
  maxTokens?: number;
}

/** Request options for `AiClient.generate()` and `AiClient.generateStream()`. */
export interface AiClientRequest {
  /** The AI provider to use. If omitted, the server picks the first configured provider. */
  provider?: AiProvider;
  /** The model name, e.g. `'gemini-2.5-flash'` or `'gpt-4o'`. */
  model?: string;
  /** Message history (system, user, assistant messages). */
  messages: AiMessage[];
  /** Generation config overrides. */
  config?: AiGenerateConfig;
}

/** Non-streaming response from `AiClient.generate()`. */
export interface AiClientResponse {
  text: string;
  provider: AiProvider;
  model: string;
}

/** A chunk received during an SSE streaming response. */
export interface AiStreamEvent {
  /** The text content of this chunk. */
  text: string;
  /** Whether this is the final chunk. */
  done: boolean;
  /** The provider that generated this chunk. */
  provider: AiProvider;
  /** The model used. */
  model: string;
}

/** Error event received during streaming. */
export interface AiStreamError {
  error: string;
}

/** Options for constructing an `AiClient`. */
export interface AiClientOptions {
  /** Override the endpoint URL. Defaults to `'/cms/api/ai.generate'`. */
  endpoint?: string;
}

/**
 * Client for the `/cms/api/ai.generate` endpoint with streaming support.
 */
export class AiClient {
  private endpoint: string;

  constructor(options?: AiClientOptions) {
    this.endpoint = options?.endpoint || '/cms/api/ai.generate';
  }

  /**
   * Sends a non-streaming AI generation request and returns the full response.
   */
  async generate(request: AiClientRequest): Promise<AiClientResponse> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      credentials: 'same-origin',
      body: JSON.stringify({
        provider: request.provider,
        model: request.model,
        messages: request.messages,
        stream: false,
        config: request.config,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new AiClientError(
        errorData?.error || `HTTP ${res.status}`,
        res.status
      );
    }

    const data = await res.json();
    if (!data.success) {
      throw new AiClientError(data.error || 'UNKNOWN');
    }

    return {
      text: data.text,
      provider: data.provider,
      model: data.model,
    };
  }

  /**
   * Sends a streaming AI generation request. Calls `onChunk` for each text
   * chunk as it arrives from the server. Returns a promise that resolves with
   * the complete concatenated text once the stream finishes.
   *
   * Optionally accepts an `AbortSignal` to cancel the request mid-stream.
   */
  async generateStream(
    request: AiClientRequest,
    onChunk: (event: AiStreamEvent) => void,
    options?: {signal?: AbortSignal}
  ): Promise<string> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      credentials: 'same-origin',
      body: JSON.stringify({
        provider: request.provider,
        model: request.model,
        messages: request.messages,
        stream: true,
        config: request.config,
      }),
      signal: options?.signal,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new AiClientError(errorText || `HTTP ${res.status}`, res.status);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let buffer = '';

    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, {stream: true});
        const lines = buffer.split('\n');
        // Keep the last potentially incomplete line in the buffer.
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: error')) {
            // Next data line will contain the error payload.
            continue;
          }
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') {
            return chunks.join('');
          }

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.error) {
              throw new AiClientError(parsed.error);
            }
            const event: AiStreamEvent = {
              text: parsed.text || '',
              done: parsed.done || false,
              provider: parsed.provider,
              model: parsed.model,
            };
            chunks.push(event.text);
            onChunk(event);
            if (event.done) {
              return chunks.join('');
            }
          } catch (err) {
            if (err instanceof AiClientError) throw err;
            // Skip malformed JSON lines.
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return chunks.join('');
  }
}

/** Error thrown by `AiClient` methods. */
export class AiClientError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AiClientError';
    this.status = status;
  }
}
