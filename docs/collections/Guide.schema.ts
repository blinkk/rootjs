import {schema} from '@blinkk/root-cms';

const blockModules = import.meta.glob('/blocks/*/*.schema.ts', {
  eager: true,
});
const blocks = Object.values(blockModules).map(
  (module: {default: schema.Schema}) => module.default
);

export default schema.collection({
  name: 'Guide',
  description: 'How-to Guides',
  url: '/guide/[slug]',
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
          help: '',
          options: [
            {value: 'guide', label: 'Guide'},
            {value: 'cms', label: 'CMS'},
            {value: 'api', label: 'API'},
          ],
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
                of: schema.oneOf({
                  types: blocks,
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
