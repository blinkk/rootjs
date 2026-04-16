import {createVertex} from '@ai-sdk/google-vertex';
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from 'ai';
import {z} from 'zod';
import {RootCMSClient, parseDocId, unmarshalData} from './client.js';
import {CMSPluginOptions} from './plugin.js';

const DEFAULT_STREAM_MODEL = 'gemini-2.5-flash';

function resolveStreamModel(options: CMSPluginOptions): string {
  if (options.ai?.model) {
    return options.ai.model;
  }
  if (
    typeof options.experiments?.ai === 'object' &&
    options.experiments.ai.model
  ) {
    return options.experiments.ai.model;
  }
  return DEFAULT_STREAM_MODEL;
}

function buildVertexProvider(cmsClient: RootCMSClient) {
  const cmsPluginOptions = cmsClient.cmsPlugin.getConfig();
  const firebaseConfig = cmsPluginOptions.firebaseConfig;
  const project =
    cmsPluginOptions.ai?.gemini?.projectId || firebaseConfig.projectId;
  const location =
    cmsPluginOptions.ai?.gemini?.location ||
    firebaseConfig.location ||
    'us-central1';
  return createVertex({project, location});
}

function buildSystemPrompt(cmsClient: RootCMSClient): string {
  const cmsPluginOptions = cmsClient.cmsPlugin.getConfig();
  const projectName = cmsPluginOptions.name || cmsPluginOptions.id || 'website';
  return [
    `You are an assistant for a headless CMS called Root CMS, working on the "${projectName}" site.`,
    'You can help answer questions about the docs in the system, and propose or apply edits to them.',
    'Use the provided tools to look up and modify docs instead of guessing content.',
    '',
    'Tool usage guidance:',
    '- Call `readDoc` to fetch the current fields of a doc before answering questions about it or editing it.',
    '- Call `editDoc` only when the user explicitly asks you to change content. Edits save to the draft version.',
    '- Doc IDs are formatted as "CollectionId/slug" (e.g. "Pages/home").',
    '',
    'Respond in GitHub-flavored markdown. If you are unsure of an answer, say so rather than making one up.',
  ].join('\n');
}

function buildDocTools(cmsClient: RootCMSClient, modifiedBy: string) {
  return {
    readDoc: tool({
      description:
        'Read the fields of a CMS doc. Returns the fields of the draft version by default. Use this before answering questions about doc content or making edits.',
      inputSchema: z.object({
        docId: z
          .string()
          .describe('The doc id, formatted as "CollectionId/slug".'),
        mode: z
          .enum(['draft', 'published'])
          .optional()
          .describe(
            'Which version to read. Defaults to "draft". Use "published" to read the live version.'
          ),
      }),
      execute: async ({docId, mode}) => {
        try {
          const {collection, slug} = parseDocId(docId);
          const rawDoc = await cmsClient.getRawDoc(collection, slug, {
            mode: mode || 'draft',
          });
          if (!rawDoc) {
            return {found: false, docId};
          }
          const data = unmarshalData(rawDoc) || {};
          return {
            found: true,
            docId,
            fields: data.fields ?? {},
            sys: data.sys ?? null,
          };
        } catch (err: any) {
          return {found: false, docId, error: err?.message || String(err)};
        }
      },
    }),
    editDoc: tool({
      description:
        'Edit a CMS doc by saving new draft field data. The provided `fields` object replaces the entire `fields` map of the draft. Call `readDoc` first to see the current fields so you can merge your changes.',
      inputSchema: z.object({
        docId: z
          .string()
          .describe('The doc id, formatted as "CollectionId/slug".'),
        fields: z
          .record(z.any())
          .describe(
            'The full fields object to save as the draft. Overwrites existing fields.'
          ),
      }),
      execute: async ({docId, fields}) => {
        try {
          await cmsClient.saveDraftData(docId, fields, {modifiedBy});
          return {success: true, docId};
        } catch (err: any) {
          return {
            success: false,
            docId,
            error: err?.message || String(err),
          };
        }
      },
    }),
  };
}

export interface StreamChatOptions {
  cmsClient: RootCMSClient;
  messages: UIMessage[];
  user: string;
}

export function streamChat(options: StreamChatOptions) {
  const {cmsClient, messages, user} = options;
  const cmsPluginOptions = cmsClient.cmsPlugin.getConfig();
  const vertex = buildVertexProvider(cmsClient);
  const modelId = resolveStreamModel(cmsPluginOptions);
  const tools = buildDocTools(cmsClient, user);

  return streamText({
    model: vertex(modelId),
    messages: convertToModelMessages(messages),
    system: buildSystemPrompt(cmsClient),
    tools,
    stopWhen: stepCountIs(5),
  });
}
