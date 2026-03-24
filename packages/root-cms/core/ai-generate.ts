/**
 * Multi-provider AI generation module with streaming support.
 *
 * Supports Google Gemini, OpenAI, and Anthropic as AI providers. Each provider
 * implements a common interface for sending prompts and streaming responses
 * back as server-sent events.
 */

import {CMSAIProviderConfig} from './plugin.js';

/** Roles used in AI message history. */
export type AiMessageRole = 'system' | 'user' | 'assistant';

/** A single message in a conversation. */
export interface AiMessage {
  role: AiMessageRole;
  content: string;
}

/** Request body for the `/cms/api/ai.generate` endpoint. */
export interface AiGenerateRequest {
  /** The AI provider to use. */
  provider: AiProvider;
  /** The model name, e.g. `'gemini-2.5-flash'` or `'gpt-4o'`. */
  model: string;
  /** Message history (system, user, assistant messages). */
  messages: AiMessage[];
  /** Whether to stream the response via SSE. */
  stream?: boolean;
  /** Generation config overrides. */
  config?: AiGenerateConfig;
}

/** Optional generation config. */
export interface AiGenerateConfig {
  /** Controls randomness. 0 = deterministic, 1 = creative. */
  temperature?: number;
  /** Maximum number of tokens to generate. */
  maxTokens?: number;
}

/** Supported AI providers. */
export type AiProvider = 'gemini' | 'openai' | 'anthropic';

/** A chunk of streamed AI response. */
export interface AiStreamChunk {
  /** The text content of this chunk. */
  text: string;
  /** Whether this is the final chunk. */
  done: boolean;
}

/** Full (non-streaming) AI response. */
export interface AiGenerateResponse {
  /** The generated text. */
  text: string;
  /** The provider that generated the response. */
  provider: AiProvider;
  /** The model used. */
  model: string;
}

/**
 * Resolves the provider to use based on the request and available config.
 * If no provider is specified, picks the first configured provider.
 */
export function resolveProvider(
  aiConfig: CMSAIProviderConfig,
  requestedProvider?: AiProvider
): AiProvider {
  if (requestedProvider) {
    return requestedProvider;
  }
  if (aiConfig.gemini) return 'gemini';
  if (aiConfig.openai) return 'openai';
  if (aiConfig.anthropic) return 'anthropic';
  // Default to gemini (uses Application Default Credentials).
  return 'gemini';
}

/**
 * Resolves the model name when none is specified in the request.
 */
export function resolveModel(
  aiConfig: CMSAIProviderConfig,
  provider: AiProvider,
  requestedModel?: string
): string {
  if (requestedModel) {
    return requestedModel;
  }
  if (aiConfig.model) {
    return aiConfig.model;
  }
  switch (provider) {
    case 'gemini':
      return 'gemini-2.5-flash';
    case 'openai':
      return 'gpt-4o';
    case 'anthropic':
      return 'claude-sonnet-4-20250514';
  }
}

/**
 * Generates an AI response (non-streaming). Returns the full response text.
 */
export async function aiGenerate(
  aiConfig: CMSAIProviderConfig,
  request: AiGenerateRequest
): Promise<AiGenerateResponse> {
  const provider = resolveProvider(aiConfig, request.provider);
  const model = resolveModel(aiConfig, provider, request.model);

  switch (provider) {
    case 'gemini':
      return geminiGenerate(aiConfig, model, request);
    case 'openai':
      return openaiGenerate(aiConfig, model, request);
    case 'anthropic':
      return anthropicGenerate(aiConfig, model, request);
  }
}

/**
 * Generates a streaming AI response. Yields chunks of text as they arrive
 * from the provider.
 */
export async function* aiGenerateStream(
  aiConfig: CMSAIProviderConfig,
  request: AiGenerateRequest
): AsyncGenerator<AiStreamChunk> {
  const provider = resolveProvider(aiConfig, request.provider);
  const model = resolveModel(aiConfig, provider, request.model);

  switch (provider) {
    case 'gemini':
      yield* geminiGenerateStream(aiConfig, model, request);
      break;
    case 'openai':
      yield* openaiGenerateStream(aiConfig, model, request);
      break;
    case 'anthropic':
      yield* anthropicGenerateStream(aiConfig, model, request);
      break;
  }
}

// ---------------------------------------------------------------------------
// Google Gemini
// ---------------------------------------------------------------------------

/**
 * Builds the Gemini request body from the common AiGenerateRequest.
 */
function buildGeminiRequestBody(model: string, request: AiGenerateRequest) {
  const systemInstruction = request.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n');

  const contents = request.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{text: m.content}],
    }));

  const body: Record<string, any> = {contents};
  if (systemInstruction) {
    body.systemInstruction = {parts: [{text: systemInstruction}]};
  }

  const generationConfig: Record<string, any> = {};
  if (request.config?.temperature !== undefined) {
    generationConfig.temperature = request.config.temperature;
  }
  if (request.config?.maxTokens !== undefined) {
    generationConfig.maxOutputTokens = request.config.maxTokens;
  }
  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }
  return body;
}

/**
 * Returns the base URL for the Gemini API. Uses the Generative Language API
 * when an API key is provided, otherwise uses the Vertex AI REST API.
 */
function getGeminiBaseUrl(
  aiConfig: CMSAIProviderConfig,
  model: string
): {url: string; useApiKey: boolean} {
  if (aiConfig.gemini?.apiKey) {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}`,
      useApiKey: true,
    };
  }
  // Fall back to Vertex AI with ADC.
  const projectId = aiConfig.gemini?.projectId;
  const location = aiConfig.gemini?.location || 'us-central1';
  return {
    url: `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}`,
    useApiKey: false,
  };
}

/**
 * Fetches an access token using Application Default Credentials (ADC) through
 * the `firebase-admin` SDK, which is already a peer dependency.
 */
async function getGoogleAccessToken(): Promise<string> {
  const {applicationDefault} = await import('firebase-admin/app');
  const credential = applicationDefault();
  const token = await credential.getAccessToken();
  if (!token.access_token) {
    throw new Error('Failed to obtain Google access token via ADC.');
  }
  return token.access_token;
}

async function geminiGenerate(
  aiConfig: CMSAIProviderConfig,
  model: string,
  request: AiGenerateRequest
): Promise<AiGenerateResponse> {
  const {url, useApiKey} = getGeminiBaseUrl(aiConfig, model);
  const body = buildGeminiRequestBody(model, request);

  const headers: Record<string, string> = {'Content-Type': 'application/json'};
  let endpoint = `${url}:generateContent`;
  if (useApiKey) {
    endpoint += `?key=${aiConfig.gemini!.apiKey}`;
  } else {
    const token = await getGoogleAccessToken();
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const text =
    data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ||
    '';

  return {text, provider: 'gemini', model};
}

async function* geminiGenerateStream(
  aiConfig: CMSAIProviderConfig,
  model: string,
  request: AiGenerateRequest
): AsyncGenerator<AiStreamChunk> {
  const {url, useApiKey} = getGeminiBaseUrl(aiConfig, model);
  const body = buildGeminiRequestBody(model, request);

  const headers: Record<string, string> = {'Content-Type': 'application/json'};
  let endpoint = `${url}:streamGenerateContent?alt=sse`;
  if (useApiKey) {
    endpoint += `&key=${aiConfig.gemini!.apiKey}`;
  } else {
    const token = await getGoogleAccessToken();
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gemini streaming API error (${res.status}): ${errorText}`);
  }

  yield* parseSSEStream(res, (parsed: any) => {
    const text =
      parsed.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text)
        .join('') || '';
    return text;
  });
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

async function openaiGenerate(
  aiConfig: CMSAIProviderConfig,
  model: string,
  request: AiGenerateRequest
): Promise<AiGenerateResponse> {
  const apiKey = aiConfig.openai?.apiKey;
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured.');
  }

  const messages = request.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const body: Record<string, any> = {model, messages};
  if (request.config?.temperature !== undefined) {
    body.temperature = request.config.temperature;
  }
  if (request.config?.maxTokens !== undefined) {
    body.max_tokens = request.config.maxTokens;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (aiConfig.openai?.orgId) {
    headers['OpenAI-Organization'] = aiConfig.openai.orgId;
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  return {text, provider: 'openai', model};
}

async function* openaiGenerateStream(
  aiConfig: CMSAIProviderConfig,
  model: string,
  request: AiGenerateRequest
): AsyncGenerator<AiStreamChunk> {
  const apiKey = aiConfig.openai?.apiKey;
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured.');
  }

  const messages = request.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const body: Record<string, any> = {model, messages, stream: true};
  if (request.config?.temperature !== undefined) {
    body.temperature = request.config.temperature;
  }
  if (request.config?.maxTokens !== undefined) {
    body.max_tokens = request.config.maxTokens;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (aiConfig.openai?.orgId) {
    headers['OpenAI-Organization'] = aiConfig.openai.orgId;
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenAI streaming API error (${res.status}): ${errorText}`);
  }

  yield* parseSSEStream(res, (parsed: any) => {
    if (parsed.choices?.[0]?.finish_reason === 'stop') {
      return '';
    }
    return parsed.choices?.[0]?.delta?.content || '';
  });
}

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

async function anthropicGenerate(
  aiConfig: CMSAIProviderConfig,
  model: string,
  request: AiGenerateRequest
): Promise<AiGenerateResponse> {
  const apiKey = aiConfig.anthropic?.apiKey;
  if (!apiKey) {
    throw new Error('Anthropic API key is not configured.');
  }

  const systemMessages = request.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n');

  const messages = request.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  const body: Record<string, any> = {
    model,
    messages,
    max_tokens: request.config?.maxTokens || 4096,
  };
  if (systemMessages) {
    body.system = systemMessages;
  }
  if (request.config?.temperature !== undefined) {
    body.temperature = request.config.temperature;
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const text =
    data.content
      ?.filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('') || '';
  return {text, provider: 'anthropic', model};
}

async function* anthropicGenerateStream(
  aiConfig: CMSAIProviderConfig,
  model: string,
  request: AiGenerateRequest
): AsyncGenerator<AiStreamChunk> {
  const apiKey = aiConfig.anthropic?.apiKey;
  if (!apiKey) {
    throw new Error('Anthropic API key is not configured.');
  }

  const systemMessages = request.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n');

  const messages = request.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  const body: Record<string, any> = {
    model,
    messages,
    max_tokens: request.config?.maxTokens || 4096,
    stream: true,
  };
  if (systemMessages) {
    body.system = systemMessages;
  }
  if (request.config?.temperature !== undefined) {
    body.temperature = request.config.temperature;
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(
      `Anthropic streaming API error (${res.status}): ${errorText}`
    );
  }

  yield* parseAnthropicStream(res);
}

/**
 * Parses an Anthropic SSE stream. Anthropic uses a custom event format with
 * `event:` and `data:` lines where events like `content_block_delta` contain
 * the actual text deltas.
 */
async function* parseAnthropicStream(
  res: Response
): AsyncGenerator<AiStreamChunk> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, {stream: true});
      const lines = buffer.split('\n');
      // Keep the last potentially incomplete line in the buffer.
      buffer = lines.pop() || '';

      let currentEvent = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
          continue;
        }
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          if (currentEvent === 'content_block_delta') {
            try {
              const parsed = JSON.parse(dataStr);
              const text = parsed.delta?.text || '';
              if (text) {
                yield {text, done: false};
              }
            } catch {
              // Skip malformed JSON lines.
            }
          } else if (currentEvent === 'message_stop') {
            yield {text: '', done: true};
            return;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield {text: '', done: true};
}

// ---------------------------------------------------------------------------
// Shared SSE stream parser (Gemini / OpenAI format).
// ---------------------------------------------------------------------------

/**
 * Parses a standard SSE stream where each event has a `data: ` prefix.
 * The `extractText` callback extracts text from the parsed JSON object.
 */
async function* parseSSEStream(
  res: Response,
  extractText: (parsed: any) => string
): AsyncGenerator<AiStreamChunk> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
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
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.slice(6).trim();
        if (dataStr === '[DONE]') {
          yield {text: '', done: true};
          return;
        }
        try {
          const parsed = JSON.parse(dataStr);
          const text = extractText(parsed);
          if (text) {
            yield {text, done: false};
          }
        } catch {
          // Skip malformed JSON lines.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield {text: '', done: true};
}
