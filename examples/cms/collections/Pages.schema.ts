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
          help: 'Meta image for social shares. Recommended: 1400x600 JPG.',
        }),
      ],
    }),

    schema.object({
      id: 'content',
      label: 'Content',
      fields: [
        schema.richtext({
          id: 'body',
          label: 'Content Body',
          translate: true,
        }),
      ],
    }),
  ],
});
