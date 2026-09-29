import {schema} from '@blinkk/root-cms';
import {DOCS_CATEGORIES} from '@/utils/docs-categories.js';

export default schema.collection({
  name: 'Docs',
  description: 'Technical documentation for developers.',
  url: '/docs/[...slug]',
  // Editors set the order of the docs in the sidebar by dragging docs in the
  // collection's "Custom order" view.
  customSorting: true,
  preview: {
    title: 'meta.title',
    image: 'meta.image',
    defaultImage: {
      src: 'https://lh3.googleusercontent.com/c2ECbvhJtxf3xbPIjaXCSpmvAsJkkhzJwG98T9RPvWy4s30jZKClom8pvWTnupRYOnyI3qGhNXPOwqoN6sqljkDO62LIKRtR988',
    },
  },

  fields: [
    schema.object({
      id: 'meta',
      label: 'Meta',
      fields: [
        schema.string({
          id: 'title',
          label: 'Title',
          translate: true,
        }),
        schema.string({
          id: 'description',
          label: 'Description',
          help: 'Description for SEO and social shares.',
          translate: true,
          variant: 'textarea',
        }),
        schema.image({
          id: 'image',
          label: 'Image',
          help: 'Meta image for social shares. Recommended size: 1200x600.',
        }),
        schema.select({
          id: 'category',
          label: 'Category',
          help: 'Sidebar group the doc is listed under.',
          options: DOCS_CATEGORIES.map((category) => ({
            value: category.id,
            label: category.label,
          })),
        }),
        schema.string({
          id: 'navLabel',
          label: 'Sidebar label',
          help: 'Short label for the sidebar. Defaults to the content title.',
          translate: true,
        }),
        schema.reference({
          id: 'nextDoc',
          label: 'Next Doc',
          help: 'Suggested doc to read next.',
          collections: ['Docs'],
        }),
      ],
    }),

    schema.object({
      id: 'content',
      label: 'Content',
      fields: [
        schema.string({
          id: 'title',
          label: 'Content title',
          help: 'Top content title.',
          variant: 'textarea',
          translate: true,
        }),
        schema.richtext({
          id: 'body',
          label: 'Content body',
          help: 'Top content body.',
          translate: true,
        }),
        schema.select({
          id: 'reference',
          label: 'Generated reference',
          help: 'Adds reference docs generated from the source code after the sections. Regenerate with `node scripts/generate_reference.ts`.',
          options: [
            {value: 'cli', label: 'CLI reference'},
            {value: 'api-root', label: 'API reference: @blinkk/root'},
            {value: 'api-root-cms', label: 'API reference: @blinkk/root-cms'},
            {
              value: 'api-root-password-protect',
              label: 'API reference: @blinkk/root-password-protect',
            },
          ],
        }),
        schema.array({
          id: 'sections',
          label: 'Sections',
          help: 'Each section is added to the Table of Contents.',
          preview: ['{title} (#{id})', '{title}', '#{id}'],
          of: schema.object({
            fields: [
              schema.string({
                id: 'id',
                label: 'Section: ID',
                help: 'Section ID (for deeplinking).',
              }),
              schema.string({
                id: 'title',
                label: 'Section: Title',
                help: 'Title for the section.',
                variant: 'textarea',
                translate: true,
              }),
              schema.richtext({
                id: 'body',
                label: 'Section: Content body',
                help: 'Main content body for the section.',
                translate: true,
              }),
              schema.array({
                id: 'blocks',
                label: 'Section: Blocks',
                help: 'Add blocks to embed various content types to the section.',
                defaultOpen: true,
                of: schema.oneOf({
                  types: schema.glob('/blocks/*/*.schema.ts'),
                }),
                preview: [
                  'm{_index:02}: {_type} ({id})',
                  'm{_index:02}: {_type}',
                  'm{_index:02}',
                ],
              }),
            ],
          }),
        }),
      ],
    }),
  ],
});
