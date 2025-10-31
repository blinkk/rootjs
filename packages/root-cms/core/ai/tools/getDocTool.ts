import {z} from 'zod';
import {DocMode, RootCMSClient, parseDocId} from '../../client.js';

const DOC_MODES = ['draft', 'published'] as const satisfies DocMode[];

export const rootCmsGetDocToolMetadata = {
  name: 'root_cms.get_doc',
  description:
    'Fetch a document from the current Root CMS project by collection and slug.',
} as const;

export const rootCmsGetDocInputSchema = z
  .object({
    docId: z
      .string()
      .describe('Fully-qualified doc id in the format "<Collection>/<slug>".')
      .optional(),
    collectionId: z
      .string()
      .describe('Collection id (e.g. "Pages").')
      .optional(),
    slug: z.string().describe('Doc slug (e.g. "home").').optional(),
    mode: z
      .enum(DOC_MODES)
      .default('draft')
      .describe('Whether to fetch the draft or published version of the doc.'),
  })
  .refine(
    (value) => {
      if (value.docId) {
        return true;
      }
      return Boolean(value.collectionId && value.slug);
    },
    {
      message:
        'Provide either "docId" or both "collectionId" and "slug" for the doc to fetch.',
      path: ['docId'],
    }
  );

export type RootCmsGetDocInput = z.infer<typeof rootCmsGetDocInputSchema>;

export const rootCmsGetDocInputJsonSchema = {
  type: 'object',
  properties: {
    docId: {
      type: 'string',
      description:
        'Fully-qualified doc id in the format "<Collection>/<slug>" (e.g. "Pages/home").',
    },
    collectionId: {
      type: 'string',
      description: 'Collection id (e.g. "Pages").',
    },
    slug: {
      type: 'string',
      description: 'Doc slug (e.g. "home").',
    },
    mode: {
      type: 'string',
      enum: [...DOC_MODES],
      description: 'Whether to fetch the draft or published version of the doc.',
      default: 'draft',
    },
  },
  oneOf: [
    {
      required: ['docId'],
    },
    {
      required: ['collectionId', 'slug'],
    },
  ],
  additionalProperties: false,
} as const;

export interface RootCmsGetDocContext {
  collectionId: string;
  slug: string;
  mode: DocMode;
}

export interface RootCmsGetDocResult extends RootCmsGetDocContext {
  doc: unknown | null;
}

export function normalizeRootCmsGetDocInput(
  rawInput: unknown
): RootCmsGetDocContext {
  const parsed = rootCmsGetDocInputSchema.parse(rawInput);
  let collectionId = parsed.collectionId;
  let slug = parsed.slug;
  if (parsed.docId) {
    const docInfo = parseDocId(parsed.docId);
    collectionId = docInfo.collection;
    slug = docInfo.slug;
  }
  if (!collectionId || !slug) {
    throw new Error(
      'A collection id and slug are required to fetch a doc from Root CMS.'
    );
  }
  const mode: DocMode = parsed.mode ?? 'draft';
  return {collectionId, slug, mode};
}

export async function fetchRootCmsDoc(
  cmsClient: RootCMSClient,
  rawInput: unknown
): Promise<RootCmsGetDocResult> {
  const context = normalizeRootCmsGetDocInput(rawInput);
  const doc = await cmsClient.getDoc(context.collectionId, context.slug, {
    mode: context.mode,
  });
  return {...context, doc};
}

export type GenkitTool = {
  name: string;
  description: string;
  inputSchema: unknown;
  outputSchema: unknown;
  handler: (input: unknown) => Promise<unknown>;
};

export function createRootCmsGetDocGenkitTool(
  cmsClient: RootCMSClient
): GenkitTool {
  return {
    name: rootCmsGetDocToolMetadata.name,
    description: rootCmsGetDocToolMetadata.description,
    inputSchema: rootCmsGetDocInputSchema,
    outputSchema: z.any(),
    async handler(input: unknown) {
      const result = await fetchRootCmsDoc(cmsClient, input);
      if (!result.doc) {
        throw new Error(
          `Doc not found: ${result.collectionId}/${result.slug} (mode: ${result.mode})`
        );
      }
      return result.doc;
    },
  };
}
