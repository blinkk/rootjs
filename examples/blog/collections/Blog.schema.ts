import * as schema from '@blinkk/root-cms/schema';
import Page from '@/routes/blog/[slug].js';

export default schema.collection({
  name: 'Blog',
  description: 'Blog.',
  url: '/blog',
  Component: Page,
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
      ],
    }),
    schema.object({
      id: 'content',
      label: 'Content',
      fields: [
        schema.string({
          id: 'body',
          label: 'Body copy (markdown)',
          translate: true,
        }),
      ],
    }),
  ],
});
