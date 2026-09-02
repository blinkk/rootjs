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
 *
 * `google-vertex` is the one provider whose SDK package is NOT browser-safe
 * (its auth helpers need a service account key or `google-auth-library`), so
 * Vertex chat models are built here from the same `GoogleLanguageModel` the
 * Vertex provider uses internally, pointed at the Vertex endpoint and
 * authenticated with a bearer token minted server-side (see
 * `core/ai-vertex.ts`) or an express-mode API key.
 */
import {createAnthropic} from '@ai-sdk/anthropic';
import {createGoogleGenerativeAI} from '@ai-sdk/google';
import {GoogleLanguageModel} from '@ai-sdk/google/internal';
import {createOpenAI} from '@ai-sdk/openai';
import {createOpenAICompatible} from '@ai-sdk/openai-compatible';
import {generateId, ImageModel, LanguageModel} from 'ai';

export type AiExecutionMode = 'read' | 'approve' | 'auto';

/**
 * Provider type for an AI model. Use `openai-compatible` for any OpenAI-style
 * endpoint (e.g. local Ollama, vLLM, OpenRouter). Use `google-vertex` to call
 * Gemini/Imagen through Vertex AI with Google Cloud credentials instead of a
 * Gemini API key.
 */
export type AiProvider =
  | 'openai'
  | 'openai-compatible'
  | 'anthropic'
  | 'google'
  | 'google-vertex';

/** Default Vertex AI location used when a `google-vertex` model omits one. */
export const DEFAULT_VERTEX_LOCATION = 'global';

/** Vertex AI express-mode endpoint (API key auth, no project/location). */
const VERTEX_EXPRESS_MODE_BASE_URL =
  'https://aiplatform.googleapis.com/v1/publishers/google';

/**
 * Safety margin applied to `credentialsExpireAt` so a cached model config is
 * refreshed before a long tool loop runs into an expired token.
 */
const CREDENTIALS_EXPIRY_MARGIN_MS = 2 * 60 * 1000;

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
  /**
   * API key for the provider. For `google-vertex` this is an optional
   * express-mode API key; omit it to authenticate with Google Cloud
   * Application Default Credentials instead.
   */
  apiKey?: string;
  /** Override the provider's base URL (required for `openai-compatible`). */
  baseURL?: string;
  /** Custom headers to send with each request. */
  headers?: Record<string, string>;
  /**
   * Google Cloud project id (`google-vertex` only). Defaults to the CMS's
   * `firebaseConfig.projectId`, then to the Application Default Credentials
   * project.
   */
  project?: string;
  /**
   * Vertex AI location (`google-vertex` only), e.g. `us-central1`. Defaults
   * to `global`. Imagen models are only served from regional locations, so
   * Vertex image models usually need this set explicitly.
   */
  location?: string;
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
  project?: string;
  location?: string;
  /**
   * Epoch ms after which short-lived credentials carried in `headers` (e.g.
   * the `google-vertex` access token) expire. Callers caching the config must
   * re-fetch it once `testClientModelExpired` returns true.
   */
  credentialsExpireAt?: number;
  capabilities: {
    tools: boolean;
    reasoning: boolean;
    attachments: boolean;
  };
}

/**
 * Returns whether a serialized client model carries short-lived credentials
 * that have expired (or are about to), meaning it must be re-fetched from the
 * server before the next request.
 */
export function testClientModelExpired(
  model: Pick<SerializedClientModel, 'credentialsExpireAt'>,
  now = Date.now()
): boolean {
  if (typeof model.credentialsExpireAt !== 'number') {
    return false;
  }
  return model.credentialsExpireAt - CREDENTIALS_EXPIRY_MARGIN_MS <= now;
}

/** Returns whether `headers` carries an `Authorization` header (any casing). */
export function testHasAuthorizationHeader(
  headers?: Record<string, string>
): boolean {
  return Object.keys(headers || {}).some(
    (key) => key.toLowerCase() === 'authorization'
  );
}

/**
 * Returns the Vertex AI API host for a location, mirroring the AI SDK's
 * Vertex provider: `global` and the `eu`/`us` multi-regions use dedicated
 * hosts, everything else is a regional endpoint.
 */
function getVertexHost(location: string): string {
  if (location === 'global') {
    return 'aiplatform.googleapis.com';
  }
  if (location === 'eu' || location === 'us') {
    return `aiplatform.${location}.rep.googleapis.com`;
  }
  return `${location}-aiplatform.googleapis.com`;
}

/**
 * Builds the Gemini language model for a `google-vertex` config.
 *
 * With an `apiKey` the request goes to the Vertex express-mode endpoint;
 * otherwise `project` and an `Authorization: Bearer` header are required (the
 * server attaches both from Application Default Credentials before the config
 * reaches this function — see `resolveVertexCredentials` in
 * `core/ai-vertex.ts`).
 */
function createVertexLanguageModel(
  model: AiModelConfig,
  modelId: string
): LanguageModel {
  let baseURL: string;
  let headers: Record<string, string> | undefined;
  if (model.apiKey) {
    baseURL = model.baseURL || VERTEX_EXPRESS_MODE_BASE_URL;
    headers = {'x-goog-api-key': model.apiKey, ...model.headers};
  } else {
    if (!testHasAuthorizationHeader(model.headers)) {
      throw new Error(
        `model "${model.id}" requires credentials for provider "google-vertex": set an express-mode apiKey, or resolve Application Default Credentials on the server first`
      );
    }
    if (!model.project) {
      throw new Error(
        `model "${model.id}" requires a project for provider "google-vertex"`
      );
    }
    const location = model.location || DEFAULT_VERTEX_LOCATION;
    baseURL =
      model.baseURL ||
      `https://${getVertexHost(location)}/v1beta1/projects/${model.project}/locations/${location}/publishers/google`;
    headers = model.headers;
  }
  return new GoogleLanguageModel(modelId, {
    provider: 'google.vertex.chat',
    baseURL: baseURL.replace(/\/$/, ''),
    headers,
    generateId,
    supportedUrls: () => ({
      // Vertex accepts public HTTP(S) URLs and Cloud Storage URIs as file parts.
      '*': [/^https?:\/\/.*$/, /^gs:\/\/.*$/],
    }),
  });
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
    case 'google-vertex': {
      return createVertexLanguageModel(model, modelId);
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
    case 'google-vertex': {
      // Image generation only runs on the server, where the Vertex SDK can
      // authenticate with Application Default Credentials directly.
      throw new Error(
        `image model "${model.id}" for provider "google-vertex" must be resolved with resolveServerImageModel (core/ai-vertex.ts)`
      );
    }
    default: {
      throw new Error(
        `provider "${model.provider}" does not support image generation`
      );
    }
  }
}

/**
 * Returns whether an image model can edit an existing image, i.e. accept one
 * or more source images alongside the text prompt (image-to-image), rather
 * than only generating from scratch (text-to-image).
 *
 * Support is provider- and model-specific:
 * - `openai`: the `/images/edits` endpoint backs `gpt-image-*` and `dall-e-2`.
 *   `dall-e-3` is generation-only.
 * - `google`: only the Gemini image models accept source images. Imagen models
 *   are generation-only on the Gemini API.
 * - `google-vertex`: Gemini image models accept source images, and the Imagen
 *   "capability" models expose Vertex's reference-image editing API.
 */
export function testSupportsImageEditing(model: AiModelConfig): boolean {
  const modelId = model.modelId || model.id;
  switch (model.provider) {
    case 'openai':
      return !modelId.startsWith('dall-e-3');
    case 'google':
      return modelId.startsWith('gemini-');
    case 'google-vertex':
      return modelId.startsWith('gemini-') || modelId.includes('-capability-');
    default:
      return false;
  }
}

export function normalizeExecutionMode(value: unknown): AiExecutionMode {
  if (value === 'read' || value === 'approve' || value === 'auto') {
    return value;
  }
  return 'approve';
}
