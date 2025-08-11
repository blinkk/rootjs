import {Part} from 'genkit';

/** Chats can either contain a single part, or multiple parts (e.g. for attachments). */
export type ChatPrompt = Part | Part[];

/**
 * The AI chat mode.
 *
 * - chat: Used in the "Chat with Root AI" sidebar tool.
 * - edit: Used in the "Edit with AI" modal dialog for editing JSON files.
 */
export type ChatMode = 'chat' | 'edit' | 'altText';

export interface AiResponse {
  message: string;
  data: Record<string, any> | null;
  error?: string;
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
