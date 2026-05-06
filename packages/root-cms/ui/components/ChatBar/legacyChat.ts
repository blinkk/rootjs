/**
 * Legacy chat controller used by the `AiEditModal` and `FileField` alt-text
 * generator. This wraps the old Genkit-backed `/cms/api/ai.chat` endpoint and
 * preserves the type surface that those components depend on.
 *
 * The Vercel AI SDK powered chat used on the `/cms/ai` page lives in
 * `pages/AIPage/AIPage.tsx` and uses `useChat` from `@ai-sdk/react` directly.
 */
import {useState} from 'preact/hooks';
import {ChatApiRequest, ChatApiResponse} from '../../../core/api.js';
import {
  AiResponse,
  ChatPrompt,
  SendPromptOptions,
} from '../../../shared/ai/prompts.js';
import {autokey} from '../../utils/rand.js';
import {Message} from './ChatBar.js';

export interface ChatController {
  chatId?: string;
  messages: Message[];
  addMessage: (message: Message) => number;
  updateMessage: (messageId: number, message: Message) => void;
  sendPrompt: (
    messageId: number,
    prompt: ChatPrompt | ChatPrompt[],
    options?: SendPromptOptions
  ) => Promise<AiResponse | null>;
}

export function useLegacyChat(): ChatController {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatId, setChatId] = useState('');

  const addMessage = (message: Message) => {
    let messageId = 0;
    setMessages((current) => {
      const pendingMessage: Message = {
        sender: 'bot',
        blocks: [{type: 'pending'}],
        key: autokey(),
      };
      const newMessages = [
        ...current,
        {...message, key: autokey()},
        pendingMessage,
      ];
      messageId = newMessages.length - 1;
      return newMessages;
    });
    return messageId;
  };

  const updateMessage = (messageId: number, message: Message) => {
    setMessages((current) => {
      const newMessages = [...current];
      newMessages[messageId] = {...message, key: autokey()};
      return newMessages;
    });
  };

  const sendPrompt = async (
    messageId: number,
    prompt: ChatPrompt | ChatPrompt[],
    options?: SendPromptOptions
  ): Promise<AiResponse> => {
    const endpoint = '/cms/api/ai.chat';
    const req: ChatApiRequest = {prompt, chatId, options};
    const res = await window.fetch(endpoint, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(req),
    });
    if (res.status !== 200) {
      const err = await res.text();
      console.error('chat failed', err);
      const errorMessage = ['Something went wrong:', '```', err, '```'].join(
        '\n'
      );
      updateMessage(messageId, {
        sender: 'bot',
        blocks: [{type: 'text', text: errorMessage}],
      });
      return {message: errorMessage, data: {}, error: err};
    }
    const resData = (await res.json()) as ChatApiResponse;
    if (resData.success && resData.chatId) {
      setChatId(resData.chatId);
      updateMessage(messageId, {
        sender: 'bot',
        data: resData.response?.data || {},
        blocks: [{type: 'text', text: resData.response?.message || ''}],
      });
      return resData.response;
    }
    return {
      message: 'Sorry. Something went wrong. An unknown error occurred.',
      data: {},
      error: 'Unknown error',
    };
  };

  return {chatId, messages, addMessage, updateMessage, sendPrompt};
}
