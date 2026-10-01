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
          help: 'Meta image for social shares. Recommended: 1200x630 JPG.',
          aspectRatio: '1200:630',
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
          help: 'Compose the page by adding one or more page modules.',
          of: schema.oneOf({
            // Every `templates/<Name>/<Name>.schema.ts` file is available here.
            types: schema.glob('/templates/*/*.schema.ts'),
          }),
          preview: ['{_type}: {title}', '{_type}'],
        }),
      ],
    }),
  ],
});
