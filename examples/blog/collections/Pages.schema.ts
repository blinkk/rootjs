import {schema} from '@blinkk/root-cms';

export default schema.collection({
  name: 'Pages',
  description: 'Landing pages.',
  url: '/[...slug]',
  preview: {
    title: 'meta.title',
    image: 'meta.image',
  },

  fields: [
    schema.string({
      id: 'internalDesc',
      label: '[INTERNAL] Description',
      help: 'Internal-only field. Used for notes, etc.',
      variant: 'textarea',
    }),

    schema.object({
      id: 'meta',
      label: 'Meta',
      fields: [
        schema.string({
          id: 'title',
          label: 'Title',
          help: 'Page title.',
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
          help: 'Meta image for social shares. Recommended: 1400x600 JPG.',
        }),
      ],
    }),

    schema.object({
      id: 'content',
      label: 'Content',
      fields: [
        schema.array({
          id: 'modules',
          label: 'Modules',
          help: 'Compose the page by adding one or more modules.',
          of: schema.oneOf({
            types: schema.glob('/templates/*/*.schema.ts'),
          }),
          preview: [
            'm{_index:02}: {_type} (#{id})',
            'm{_index:02}: {_type}',
            'm{_index:02}',
          ],
        }),
      ],
    }),

    schema.object({
      id: 'advanced',
      label: 'Advanced',
      fields: [
        schema.string({
          id: 'analtyics',
          label: 'Analytics',
          help: 'HTML injected into the page for custom analytics.',
          variant: 'textarea',
        }),
      ],
    }),
  ],
});
