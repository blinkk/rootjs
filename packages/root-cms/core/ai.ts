import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {vertexAI} from '@genkit-ai/vertexai';
import {Timestamp} from 'firebase-admin/firestore';
import {Genkit, genkit, MessageData, Part} from 'genkit';
import {RootCMSClient} from './client.js';
import {CMSPluginOptions} from './plugin.js';

export type ChatPrompt = Part[];

type HistoryItem = MessageData;

/** Supported Root AI models. Defaults to 'vertexai/gemini-2.5-flash'. */
export type RootAiModel =
  | 'vertexai/gemini-2.5-flash'
  | 'vertexai/gemini-2.0-pro'
  | 'vertexai/gemini-1.5-flash'
  | 'vertexai/gemini-1.5-pro';

const DEFAULT_MODEL: RootAiModel = 'vertexai/gemini-2.5-flash';

export type ChatMode = 'chat' | 'edit';

export interface SendPromptOptions {
  mode?: ChatMode;
  /** Data sent for edit mode requests. */
  editData?: Record<string, any>;
}

export class Chat {
  chatClient: ChatClient;
  cmsClient: RootCMSClient;
  cmsPluginOptions: CMSPluginOptions;
  id: string;
  history: HistoryItem[];
  model: string;
  ai: Genkit;

  constructor(
    chatClient: ChatClient,
    id: string,
    options?: {history?: HistoryItem[]; model?: string}
  ) {
    this.chatClient = chatClient;
    this.cmsClient = chatClient.cmsClient;
    this.cmsPluginOptions = this.cmsClient.cmsPlugin.getConfig();
    this.id = id;
    this.history = options?.history ?? [];
    this.model =
      options?.model ||
      (typeof this.cmsPluginOptions.experiments?.ai === 'object'
        ? this.cmsPluginOptions.experiments.ai.model
        : undefined) ||
      DEFAULT_MODEL;
    const firebaseConfig = this.cmsPluginOptions.firebaseConfig;
    this.ai = genkit({
      plugins: [
        vertexAI({
          projectId: firebaseConfig.projectId,
          location: firebaseConfig.location || 'us-central1',
        }),
      ],
    });
  }

  /** Builds the messages for the AI request. */
  private async buildMessages(
    options: SendPromptOptions
  ): Promise<MessageData[]> {
    const messages = this.history;
    if (messages.length === 0) {
      messages.push({
        role: 'system',
        content: [{text: await this.buildSystemPrompt(options)}],
      });
    }
    if (options.mode === 'edit') {
      messages.push({
        role: 'user',
        content: [
          {
            text: [
              'The JSON  you must edit is:',
              '',
              JSON.stringify(options.editData || {}, null, 2),
            ].join(''),
          },
        ],
      });
    }
    return messages;
  }

  private async buildChatRequest(
    prompt: ChatPrompt,
    options: SendPromptOptions
  ) {
    if (options.mode === 'edit') {
      return {
        messages: await this.buildMessages(options),
        model: this.model,
        prompt: prompt,
      };
    }
    return {
      messages: await this.buildMessages(options),
      model: this.model,
      prompt: prompt,
    };
  }

  async sendPrompt(
    prompt: ChatPrompt,
    options: SendPromptOptions = {}
  ): Promise<string> {
    const res = await this.ai.generate(
      await this.buildChatRequest(prompt, options)
    );
    this.history = res.messages;
    await this.dbDoc().update({
      history: this.history,
      modifiedAt: Timestamp.now(),
    });
    return res.text;
  }

  dbDoc() {
    return this.chatClient.dbCollection().doc(this.id);
  }

  private async buildSystemPrompt(options: SendPromptOptions): Promise<string> {
    const serializedRootConfig = JSON.stringify(
      this.cmsClient.rootConfig,
      null,
      2
    );

    if (options.mode === 'edit') {
      const rootDir = process.cwd();
      const rootCmsDefs = fs.readFileSync(
        path.resolve(rootDir, 'root-cms.d.ts'),
        {
          encoding: 'utf8',
        }
      );
      const text = (await import('./ai/prompts/edit.txt')).default;
      text.replace('{{ROOT_CMS_DEFS}}', rootCmsDefs);
      return text;
    }
    const systemText = [
      `You are an assistant for a headless CMS called Root CMS which is used on a website called ${
        this.cmsPluginOptions.name || this.cmsPluginOptions.id
      }. Your job is to answer questions about the docs in the system, and if requested, help suggest changes to the JSON data in the docs. If you don't know the answer, just say that you don't know, don't try to make up an answer. Be friendly and playful with your messaging.`,
      '',
      'Here is the root.config.ts file for the site:',
      '```',
      serializedRootConfig,
      '```',
      '',
      'Here are the docs that exist in the system:',
    ];
    const pages = await this.cmsClient.listDocs('Pages', {mode: 'draft'});
    pages.docs.forEach((doc: any) => {
      systemText.push(JSON.stringify(doc));
    });
    return systemText.join('\n');
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
    // Save chat to db so that user has a chat history and can enable "sharing"
    // with others. Store the model used with the metadata.
    const docRef = this.dbCollection().doc(chatId);
    const chat = new Chat(this, chatId);
    await docRef.set({
      id: chatId,
      createdBy: this.user,
      createdAt: Timestamp.now(),
      modifiedAt: Timestamp.now(),
      model: chat.model,
    });
    return chat;
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
