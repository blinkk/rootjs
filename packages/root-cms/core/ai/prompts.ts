import {Part} from 'genkit';

/** Chats can either contain a single part, or multiple parts (e.g. for attachments). */
export type ChatPrompt = Part | Part[];

/**
 * The AI chat mode.
 *
 * - chat: Used in the "Chat with Root AI" sidebar tool.
 * - edit: Used in the "Edit with AI" modal dialog for editing JSON files.
 */
export type ChatMode = 'chat' | 'edit';

/** The parsed response from the AI */
export interface ParsedChatResponse {
  /** The textual response from the AI. For chat requests, this is the full response. For other types of requests, this contains just the AI's "message" response, whereas any other data will be included in the `data` property. */
  message: string;
  /** JSON data returned by the AI. */
  data: Record<string, any>;
}

/**
 * Options for constructing the prompt sent to the AI. Specify the `ChatMode`
 * and, additionally, any references to or data required to construct the
 * prompt.
 */
export interface SendPromptOptions {
  mode?: ChatMode;
  /** Data sent for edit mode requests. */
  editData?: Record<string, any>;
}

/**
 * Parses the response from the AI request. The response structure differs
 * depending on the prompt and the mode. For example, chat mode receives a text
 * response. Edit mode receives a response containing JSON, which must be
 * parsed out from the text response.
 */
export function parseResponse(
  response: string,
  mode?: ChatMode
): ParsedChatResponse {
  // TODO(jeremydw): Research whether we can require the AI or genkit to respond in structured
  // JSON format, so that we don't have to parse the response ourselves.
  // Use https://genkit.dev/docs/models/#structured-output to enforce structured output
  // instead of parsing the response.
  if (mode === 'edit') {
    const jsonMatch = response.match(/^```json\n?(.*?)\n?```$/s);
    const responseAsJson = JSON.parse(jsonMatch ? jsonMatch[1] : response);
    return {
      message: responseAsJson.message,
      data: responseAsJson.data,
    };
  }
  // Chat messages don't contain any data, just the chat response.
  return {message: response, data: {}};
}
