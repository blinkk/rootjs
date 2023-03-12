import {schema} from '@blinkk/root-cms';
import Page from '@/routes/blog/[slug].js';

export default schema.collection({
  name: 'BlogPosts',
  description:
    "A collection of posts for the blog. If you're new here, check out the [getting started](#todo) guide.",
  url: '/blog/[slug]',
  Component: Page,
  preview: {
    title: 'meta.title',
    image: 'meta.image',
  },

  fields: [
    schema.string({
      id: 'internalDesc',
      label: 'Internal Description',
      help: 'Use this field to leave internal notes, etc.',
      variant: 'textarea',
    }),

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
        schema.multiselect({
          id: 'tags',
          label: 'Tags',
          help: 'Category tags for searching and filtering.',
          creatable: true,
        }),
      ],
    }),

    schema.object({
      id: 'content',
      label: 'Content',
      fields: [
        schema.string({
          id: 'body',
          label: 'Body copy',
          help: 'Markdown supported.',
          translate: true,
          variant: 'textarea',
        }),
      ],
    }),

    schema.object({
      id: 'advanced',
      label: 'Advanced',
      fields: [
        schema.string({
          id: 'customCss',
          label: 'Custom CSS',
          help: 'Optional CSS to inject into the page.',
          translate: true,
          variant: 'textarea',
        }),
      ],
    }),
  ],
});
