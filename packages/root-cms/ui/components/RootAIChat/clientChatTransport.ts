/**
 * A Vercel AI SDK `ChatTransport` that streams **directly from the browser** to
 * the configured model provider, instead of POSTing to a server endpoint and
 * proxying an SSE response back (which did not work on App Engine / Firebase
 * Hosting).
 *
 * `sendMessages` runs `streamText` in the browser and returns its UI message
 * stream straight to `useChat`. Read tools run inside that loop (their
 * `execute` blocks hit Firestore via the web SDK); write tools have no
 * `execute`, so they surface through `useChat`'s `onToolCall` for the approval
 * flow. There is nothing to reconnect to, so `reconnectToStream` returns null.
 *
 * The per-turn system prompt + the selected model's connection config (incl.
 * the API key) come from a non-streaming server "prepare" endpoint via
 * `loadTurnConfig`.
 */
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type ChatTransport,
  type ToolSet,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import {
  resolveLanguageModel,
  withBrowserHeaders,
  type SerializedClientModel,
} from '../../../shared/ai/models.js';
import {sanitizeDanglingToolCalls} from '../../../shared/ai/prompt-utils.js';

/** Per-turn config returned by a `prepare` endpoint. */
export interface ClientTurnConfig {
  /** Selected model connection config (provider, model id, API key, headers). */
  model: SerializedClientModel;
  /** Fully assembled system prompt (includes ROOT.md). */
  system: string;
  /** Maximum tool-loop steps before stopping. */
  maxSteps: number;
}

export interface ClientChatTransportOptions {
  /**
   * Loads the per-turn config (system prompt + model connection config) from
   * the server. Called at the start of every `sendMessages`. Implementations
   * may cache when the inputs (model/mode/doc) have not changed.
   */
  loadTurnConfig: () => Promise<ClientTurnConfig>;
  /**
   * Builds the tool set for the turn. Read tools carry a client-side `execute`;
   * write tools are schema-only and surface via `onToolCall`. Return `{}` to
   * disable tools. `model` is provided so callers can honor model capabilities.
   */
  buildTools: (model: SerializedClientModel) => ToolSet;
  /**
   * Called once the stream finishes with the final message list (used to
   * persist chat history). Errors thrown here are swallowed by the SDK, so
   * handle persistence failures internally.
   */
  onFinish?: (messages: UIMessage[]) => void | Promise<void>;
}

/**
 * Creates a `ChatTransport` that streams from the browser via `streamText`.
 */
export function createClientChatTransport(
  options: ClientChatTransportOptions
): ChatTransport<UIMessage> {
  return {
    async sendMessages({messages, abortSignal}): Promise<
      ReadableStream<UIMessageChunk>
    > {
      const turn = await options.loadTurnConfig();
      const tools = options.buildTools(turn.model);
      const languageModel = resolveLanguageModel(withBrowserHeaders(turn.model));

      // Heal any tool calls left unresolved by an abandoned turn (e.g. the
      // user closed the chat mid-approval) so every `tool_use` keeps a
      // matching `tool_result` when the history is converted for the model.
      const sanitized = sanitizeDanglingToolCalls(messages);
      const modelMessages = await convertToModelMessages(sanitized, {tools});

      const result = streamText({
        model: languageModel,
        system: turn.system,
        messages: modelMessages,
        tools,
        stopWhen: stepCountIs(turn.maxSteps),
        abortSignal,
      });

      return result.toUIMessageStream({
        sendReasoning: turn.model.capabilities.reasoning,
        originalMessages: messages,
        onFinish: options.onFinish
          ? ({messages: finalMessages}) => {
              void options.onFinish!(finalMessages);
            }
          : undefined,
      });
    },

    // Client-side streaming has no resumable server stream to reconnect to.
    async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
      return null;
    },
  };
}
