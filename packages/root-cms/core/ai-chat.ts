/**
 * Vercel AI SDK-based chat for the `/cms/ai` page.
 *
 * The chat runs as a lightweight proxy between the CMS UI and the underlying
 * model provider. Conversation history is persisted to Firestore so that users
 * can resume past chats.
 */
import crypto from 'node:crypto';
import {createAnthropic} from '@ai-sdk/anthropic';
import {createGoogleGenerativeAI} from '@ai-sdk/google';
import {createOpenAI} from '@ai-sdk/openai';
import {createOpenAICompatible} from '@ai-sdk/openai-compatible';
import {RootConfig} from '@blinkk/root';
import {
  convertToModelMessages,
  LanguageModel,
  stepCountIs,
  streamText,
  ToolSet,
  UIMessage,
} from 'ai';
import {Timestamp} from 'firebase-admin/firestore';
import {createCmsTools} from './ai-tools.js';
import {RootCMSClient} from './client.js';

/**
 * Provider type for an AI model. Use `openai-compatible` for any OpenAI-style
 * endpoint (e.g. local Ollama, vLLM, OpenRouter).
 */
export type AiProvider =
  | 'openai'
  | 'openai-compatible'
  | 'anthropic'
  | 'google';

/**
 * Configuration for a single chat model.
 *
 * Inspired by Ollama's `Modelfile` and LiteLLM's model config: each entry maps
 * a CMS-facing id to a provider, model id and credentials.
 */
export interface AiModelConfig {
  /** Stable id used by the CMS UI and stored alongside chat history. */
  id: string;
  /** Optional human-readable label rendered in the model picker. */
  label?: string;
  /** Optional description shown under the label. */
  description?: string;
  /** AI provider/family to route requests to. */
  provider: AiProvider;
  /**
   * Provider-specific model id (e.g. `gpt-4o`, `claude-opus-4-5`,
   * `gemini-2.5-pro`). Defaults to `id` if omitted.
   */
  modelId?: string;
  /** API key for the provider. */
  apiKey?: string;
  /** Override the provider's base URL (required for `openai-compatible`). */
  baseURL?: string;
  /** Custom headers to send with each request. */
  headers?: Record<string, string>;
  /** Capabilities advertised to the UI. */
  capabilities?: {
    /** Whether the model can call tools. Defaults to `true`. */
    tools?: boolean;
    /** Whether the model can stream reasoning/thinking. Defaults to `false`. */
    reasoning?: boolean;
    /** Whether the model accepts image attachments. Defaults to `false`. */
    attachments?: boolean;
  };
}

/**
 * Full AI config registered on the cms plugin.
 */
export interface AiConfig {
  /** Models exposed in the model picker. The first entry is the default. */
  models: AiModelConfig[];
  /** Id of the default model. Defaults to the first model in `models`. */
  defaultModel?: string;
  /** Optional system prompt prepended to every conversation. */
  systemPrompt?: string;
  /** Maximum tool-loop steps before stopping. Defaults to 10. */
  maxSteps?: number;
}

interface ChatRecord {
  id: string;
  createdBy: string;
  createdAt: Timestamp;
  modifiedAt: Timestamp;
  modelId?: string;
  title?: string;
  messages: UIMessage[];
}

/** Resolves an `AiModelConfig` to an AI SDK `LanguageModel` instance. */
export function resolveLanguageModel(model: AiModelConfig): LanguageModel {
  const modelId = model.modelId || model.id;
  switch (model.provider) {
    case 'openai': {
      const provider = createOpenAI({
        apiKey: model.apiKey,
        baseURL: model.baseURL,
        headers: model.headers,
      });
      return provider(modelId);
    }
    case 'openai-compatible': {
      if (!model.baseURL) {
        throw new Error(
          `model "${model.id}" requires a baseURL for provider "openai-compatible"`
        );
      }
      const provider = createOpenAICompatible({
        name: model.id,
        baseURL: model.baseURL,
        apiKey: model.apiKey,
        headers: model.headers,
      });
      return provider(modelId);
    }
    case 'anthropic': {
      const provider = createAnthropic({
        apiKey: model.apiKey,
        baseURL: model.baseURL,
        headers: model.headers,
      });
      return provider(modelId);
    }
    case 'google': {
      const provider = createGoogleGenerativeAI({
        apiKey: model.apiKey,
        baseURL: model.baseURL,
        headers: model.headers,
      });
      return provider(modelId);
    }
    default: {
      throw new Error(`unknown ai provider: ${(model as any).provider}`);
    }
  }
}

/** Strips secrets from `AiConfig` before sending to the browser. */
export function serializeAiConfig(config: AiConfig) {
  return {
    defaultModel: config.defaultModel || config.models[0]?.id,
    models: config.models.map((m) => ({
      id: m.id,
      label: m.label || m.id,
      description: m.description,
      provider: m.provider,
      capabilities: {
        tools: m.capabilities?.tools !== false,
        reasoning: m.capabilities?.reasoning ?? false,
        attachments: m.capabilities?.attachments ?? false,
      },
    })),
  };
}

/** Returns the AI config registered on the CMS plugin, or `null`. */
export function getAiConfig(rootConfig: RootConfig): AiConfig | null {
  const cmsPlugin = rootConfig.plugins?.find((p) => p.name === 'root-cms') as
    | {getConfig: () => {ai?: AiConfig}}
    | undefined;
  const ai = cmsPlugin?.getConfig().ai;
  if (!ai || !Array.isArray(ai.models) || ai.models.length === 0) {
    return null;
  }
  return ai;
}

/** Returns the model config matching `modelId`, or the default model. */
export function findModel(
  config: AiConfig,
  modelId?: string
): AiModelConfig | null {
  if (modelId) {
    const match = config.models.find((m) => m.id === modelId);
    if (match) {
      return match;
    }
  }
  const defaultId = config.defaultModel || config.models[0]?.id;
  return config.models.find((m) => m.id === defaultId) || null;
}

/**
 * Persists chat sessions to Firestore so that users can resume past
 * conversations from the chat history sidebar.
 */
export class ChatStore {
  cmsClient: RootCMSClient;
  user: string;

  constructor(cmsClient: RootCMSClient, user: string) {
    this.cmsClient = cmsClient;
    this.user = user;
  }

  collection() {
    return this.cmsClient.db.collection(
      `Projects/${this.cmsClient.projectId}/AiChats`
    );
  }

  async createChat(options?: {
    id?: string;
    modelId?: string;
  }): Promise<ChatRecord> {
    const id = options?.id || crypto.randomUUID();
    const now = Timestamp.now();
    const record: ChatRecord = {
      id,
      createdBy: this.user,
      createdAt: now,
      modifiedAt: now,
      modelId: options?.modelId,
      messages: [],
    };
    await this.collection().doc(id).set(record);
    return record;
  }

  async getChat(id: string): Promise<ChatRecord | null> {
    const snap = await this.collection().doc(id).get();
    if (!snap.exists) {
      return null;
    }
    const data = snap.data() as ChatRecord;
    if (data.createdBy !== this.user) {
      return null;
    }
    return data;
  }

  async listChats(options?: {limit?: number}): Promise<ChatRecord[]> {
    const limit = options?.limit ?? 50;
    // Sort client-side to avoid requiring a Firestore composite index on
    // (createdBy, modifiedAt).
    const res = await this.collection()
      .where('createdBy', '==', this.user)
      .get();
    const records = res.docs.map((d) => d.data() as ChatRecord);
    records.sort((a, b) => {
      const aMs = a.modifiedAt?.toMillis?.() ?? 0;
      const bMs = b.modifiedAt?.toMillis?.() ?? 0;
      return bMs - aMs;
    });
    return records.slice(0, limit);
  }

  async deleteChat(id: string): Promise<void> {
    const chat = await this.getChat(id);
    if (!chat) {
      return;
    }
    await this.collection().doc(id).delete();
  }

  async updateMessages(
    id: string,
    messages: UIMessage[],
    options?: {modelId?: string; title?: string}
  ): Promise<void> {
    const updates: Record<string, any> = {
      messages,
      modifiedAt: Timestamp.now(),
    };
    if (options?.modelId) {
      updates.modelId = options.modelId;
    }
    if (options?.title) {
      updates.title = options.title;
    }
    await this.collection().doc(id).update(updates);
  }
}

/** Derives a short title from the first user message. */
export function deriveChatTitle(messages: UIMessage[]): string {
  const first = messages.find((m) => m.role === 'user');
  if (!first) {
    return 'New chat';
  }
  const text = first.parts
    .filter((p: any) => p.type === 'text')
    .map((p: any) => p.text)
    .join(' ')
    .trim();
  if (!text) {
    return 'New chat';
  }
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

export interface RunChatStreamOptions {
  rootConfig: RootConfig;
  cmsClient: RootCMSClient;
  config: AiConfig;
  model: AiModelConfig;
  messages: UIMessage[];
  chatId: string;
  user: string;
}

/**
 * Builds a streaming response that proxies the model's UI message stream
 * directly to the client. Persists the final message list to Firestore once
 * the stream finishes.
 */
export async function runChatStream(
  options: RunChatStreamOptions
): Promise<Response> {
  const {model, config, messages, cmsClient, user, chatId} = options;
  const languageModel = resolveLanguageModel(model);
  const tools: ToolSet =
    model.capabilities?.tools === false ? {} : createCmsTools();

  const systemPrompt =
    config.systemPrompt ||
    [
      'You are an assistant embedded in the Root CMS admin UI.',
      'Help the user explore and edit content, answer questions about',
      'the project, and use the provided tools to read and write CMS docs.',
      'Be concise and use markdown for rich responses.',
    ].join(' ');

  const modelMessages = await convertToModelMessages(messages, {tools});
  const result = streamText({
    model: languageModel,
    system: systemPrompt,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(config.maxSteps ?? 10),
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: model.capabilities?.reasoning ?? false,
    onFinish: async ({messages: finalMessages}) => {
      const store = new ChatStore(cmsClient, user);
      const updates = {
        modelId: model.id,
        title: deriveChatTitle(finalMessages),
      };
      try {
        // Firestore rejects `undefined` values, but the AI SDK frequently
        // produces messages with `metadata: undefined`. Strip them before
        // persisting.
        await store.updateMessages(
          chatId,
          stripUndefined(finalMessages) as UIMessage[],
          updates
        );
      } catch (err) {
        console.error('failed to persist chat history:', err);
      }
    },
  });
}

/**
 * Recursively removes `undefined` values from an object/array. Returns a new
 * structure; the input is not mutated. Used to clean payloads before sending
 * them to Firestore, which rejects `undefined` outright.
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((v) => v !== undefined)
      .map((v) => stripUndefined(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) {
        continue;
      }
      out[k] = stripUndefined(v);
    }
    return out as unknown as T;
  }
  return value;
}
