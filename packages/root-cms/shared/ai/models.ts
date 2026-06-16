/**
 * Provider/model types and resolution shared by the Root CMS server and the
 * browser.
 *
 * These helpers are deliberately framework-agnostic and free of Node-only
 * imports (`node:fs`, `firebase-admin`, etc.) so the same code can build a
 * `LanguageModel` on the server (one-shot helpers in `core/ai.ts`) and in the
 * browser (the `/cms/ai` chat now streams directly from the client — see
 * `ui/components/RootAIChat`). The provider SDKs (`@ai-sdk/*`) are all
 * `fetch`-based and bundle cleanly for the browser.
 */
import {createAnthropic} from '@ai-sdk/anthropic';
import {createGoogleGenerativeAI} from '@ai-sdk/google';
import {createOpenAI} from '@ai-sdk/openai';
import {createOpenAICompatible} from '@ai-sdk/openai-compatible';
import {ImageModel, LanguageModel} from 'ai';

export type AiExecutionMode = 'read' | 'approve' | 'auto';

/**
 * Provider type for an AI model. Use `openai-compatible` for any OpenAI-style
 * endpoint (e.g. local Ollama, vLLM, OpenRouter).
 */
export type AiProvider =
  | 'openai'
  | 'openai-compatible'
  | 'anthropic'
  | 'google';

/** Capabilities advertised to the UI. */
export interface AiModelCapabilities {
  /** Whether the model can call tools. Defaults to `true`. */
  tools?: boolean;
  /** Whether the model can stream reasoning/thinking. Defaults to `false`. */
  reasoning?: boolean;
  /** Whether the model accepts image attachments. Defaults to `false`. */
  attachments?: boolean;
}

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
  capabilities?: AiModelCapabilities;
}

/**
 * Full AI config registered on the cms plugin.
 */
export interface AiConfig {
  /** Models exposed in the model picker. The first entry is the default. */
  models: AiModelConfig[];
  /** Id of the default model. Defaults to the first model in `models`. */
  defaultModel?: string;
  /**
   * Image generation models. Used by the image generator and any other
   * features that produce images. Only the `openai` and `google` providers
   * support image generation.
   */
  imageModels?: AiModelConfig[];
  /** Id of the default image model. Defaults to the first entry in `imageModels`. */
  defaultImageModel?: string;
  /**
   * Optional system prompt prepended to every conversation. If a `ROOT.md`
   * file exists at the project root, its contents are appended to this
   * prompt automatically.
   */
  systemPrompt?: string;
  /** Maximum tool-loop steps before stopping. Defaults to 10. */
  maxSteps?: number;
}

/**
 * A chat model's connection config serialized for the browser, INCLUDING the
 * API key, so the client can build a `LanguageModel` for direct
 * browser-to-provider streaming. Returned only from authenticated endpoints
 * (see `serializeAiClientModel` in `core/ai.ts`).
 */
export interface SerializedClientModel {
  id: string;
  label: string;
  description?: string;
  provider: AiProvider;
  modelId: string;
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  capabilities: {
    tools: boolean;
    reasoning: boolean;
    attachments: boolean;
  };
}

/**
 * Anthropic blocks direct browser requests by default. Sending this header
 * opts in to the browser-CORS behavior so the `/cms/ai` chat can call the
 * Anthropic API straight from the client. OpenAI and Google's
 * `generativelanguage` endpoint already allow browser requests with an API
 * key, so no equivalent header is required for them.
 */
export const ANTHROPIC_BROWSER_ACCESS_HEADER =
  'anthropic-dangerous-direct-browser-access';

/**
 * Returns a copy of `model` with any provider-specific headers required for
 * direct browser-to-provider calls. Used when the AI SDK runs in the browser
 * (client-side streaming) rather than on the server.
 */
export function withBrowserHeaders(model: AiModelConfig): AiModelConfig {
  if (model.provider === 'anthropic') {
    return {
      ...model,
      headers: {
        ...model.headers,
        [ANTHROPIC_BROWSER_ACCESS_HEADER]: 'true',
      },
    };
  }
  return model;
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

/** Resolves an `AiModelConfig` to an AI SDK `ImageModel` instance. */
export function resolveImageModel(model: AiModelConfig): ImageModel {
  const modelId = model.modelId || model.id;
  switch (model.provider) {
    case 'openai': {
      const provider = createOpenAI({
        apiKey: model.apiKey,
        baseURL: model.baseURL,
        headers: model.headers,
      });
      return provider.image(modelId);
    }
    case 'google': {
      const provider = createGoogleGenerativeAI({
        apiKey: model.apiKey,
        baseURL: model.baseURL,
        headers: model.headers,
      });
      return provider.image(modelId);
    }
    default: {
      throw new Error(
        `provider "${model.provider}" does not support image generation`
      );
    }
  }
}

export function normalizeExecutionMode(value: unknown): AiExecutionMode {
  if (value === 'read' || value === 'approve' || value === 'auto') {
    return value;
  }
  return 'approve';
}
