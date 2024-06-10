import crypto from 'node:crypto';
import {generate} from '@genkit-ai/ai';
import {configureGenkit} from '@genkit-ai/core';
import {vertexAI} from '@genkit-ai/vertexai';
import {gemini15ProPreview, gemini15FlashPreview} from '@genkit-ai/vertexai';
import {RootCMSClient} from './client.js';

let genkitIsConfigured = false;

interface ChatPrompt {
  text?: string;
  media?: {
    url: string;
    contentType: string;
  };
}

export class Chat {
  chatClient: ChatClient;
  cmsClient: RootCMSClient;
  id: string;

  constructor(chatClient: ChatClient, id: string) {
    this.chatClient = chatClient;
    this.cmsClient = chatClient.cmsClient;
    this.id = id;
  }

  async sendPrompt(prompt: string | ChatPrompt | ChatPrompt[]): Promise<any> {
    if (!genkitIsConfigured) {
      const cmsConfig = this.cmsClient.cmsPlugin.getConfig();
      const firebaseConfig = cmsConfig.firebaseConfig;
      configureGenkit({
        plugins: [
          vertexAI({
            projectId: firebaseConfig.projectId,
            // TODO(stevenle): figure out where to get this.
            location: firebaseConfig.location || 'us-central1',
          }),
        ],
      });
      genkitIsConfigured = true;
    }

    console.log(prompt);
    const res = await generate({
      // model: gemini15ProPreview,
      model: gemini15FlashPreview,
      prompt: prompt as any,
    });
    console.log(res);
    return res.text();
  }
}

export class ChatClient {
  cmsClient: RootCMSClient;
  user: string;

  constructor(cmsClient: RootCMSClient, user: string) {
    this.cmsClient = cmsClient;
    this.user = user;
  }

  async createChat(): Promise<Chat> {
    const chatId = crypto.randomUUID();
    // TODO(stevenle): save chat to db so that user has a chat history and can
    // enable "sharing" with others.
    // TODO(stevenle): remember to store the model used in the chat metadata.
    return new Chat(this, chatId);
  }

  async getChat(chatId: string): Promise<Chat> {
    // TODO(stevenle): fetch chat from db.
    return new Chat(this, chatId);
  }
}
