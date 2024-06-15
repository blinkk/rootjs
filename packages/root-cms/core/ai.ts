import crypto from 'node:crypto';
import {generate} from '@genkit-ai/ai';
import {configureGenkit} from '@genkit-ai/core';
import {vertexAI} from '@genkit-ai/vertexai';
import {gemini15ProPreview, gemini15FlashPreview} from '@genkit-ai/vertexai';
import {Timestamp} from 'firebase-admin/firestore';
import {RootCMSClient} from './client.js';
import {CMSPluginOptions} from './plugin.js';

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
  cmsPluginOptions: CMSPluginOptions;
  id: string;
  history?: any;
  model?: string;

  constructor(
    chatClient: ChatClient,
    id: string,
    options?: {history?: any; model?: string}
  ) {
    this.chatClient = chatClient;
    this.cmsClient = chatClient.cmsClient;
    this.cmsPluginOptions = this.cmsClient.cmsPlugin.getConfig();
    this.id = id;
    this.history = options?.history;
    this.model = options?.model;
    if (!this.model) {
      if (typeof this.cmsPluginOptions.experiments?.ai === 'object') {
        if (this.cmsPluginOptions.experiments.ai.model) {
          this.model = this.cmsPluginOptions.experiments.ai.model;
        }
      }
    }
  }

  async sendPrompt(prompt: string | ChatPrompt | ChatPrompt[]): Promise<any> {
    if (!genkitIsConfigured) {
      const firebaseConfig = this.cmsPluginOptions.firebaseConfig;
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

    let model = gemini15FlashPreview;
    if (this.model === 'gemini-1.5-pro') {
      model = gemini15ProPreview;
    }

    // console.log('prompt:', prompt);
    // if (this.history) {
    //   console.log('history:', this.history);
    // }
    const res = await generate({
      model: model,
      prompt: prompt as any,
      history: this.history,
    });
    console.log(res.text());
    const history = res.toHistory();
    this.history = history;
    await this.dbDoc().update({history, modifiedAt: Timestamp.now()});
    return res.text();
  }

  dbDoc() {
    return this.chatClient.dbCollection().doc(this.id);
  }
}

export class ChatClient {
  cmsClient: RootCMSClient;
  user: string;

  constructor(cmsClient: RootCMSClient, user: string) {
    this.cmsClient = cmsClient;
    this.user = user;
  }

  async createChat(options?: {model?: string}): Promise<Chat> {
    const chatId = crypto.randomUUID();
    // Save chat to db so that user has a chat history and can enable "sharing"
    // with others. Store the model used with the metadata.
    const docRef = this.dbCollection().doc(chatId);
    await docRef.set({
      id: chatId,
      createdBy: this.user,
      createdAt: Timestamp.now(),
      modifiedAt: Timestamp.now(),
      model: options?.model || 'gemini-1.5-flash',
    });
    return new Chat(this, chatId);
  }

  async getChat(chatId: string): Promise<Chat> {
    // Fetch chat from db to preserve the conversation's history.
    const docRef = this.dbCollection().doc(chatId);
    const chatDoc = await docRef.get();
    if (!chatDoc.exists) {
      throw new Error(`${chatId} does not exist`);
    }
    const chatData = chatDoc.data() || {};
    return new Chat(this, chatId, {
      history: chatData.history,
      model: chatData.model,
    });
  }

  async listChats(options?: {limit?: number}): Promise<any[]> {
    const limit = options?.limit || 20;
    const query = this.dbCollection()
      .where('createdBy', '==', this.user)
      .limit(limit)
      .orderBy('createdAt', 'desc');
    const res = await query.get();
    return res.docs.map((doc) => doc.data());
  }

  dbCollection() {
    return this.cmsClient.db.collection(
      `Projects/${this.cmsClient.projectId}/Experiments/ai/Chat`
    );
  }
}
