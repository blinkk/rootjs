import {schema} from '@blinkk/root-cms';

export default schema.collection({
  name: 'BlogPosts',
  description: 'The dopest blog.',
  url: '/blog/[slug]',
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
          default: 'Lorem ipsum',
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
        schema.boolean({
          id: 'featured',
          label: 'Featured?',
          checkboxLabel: 'Featured Blog Post',
          help: 'Check the box to mark the blog post as a featured blog post.',
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
        schema.richtext({
          id: 'richtext',
          label: 'Blog content',
          translate: true,
        }),
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
          deprecated: true,
        }),
        schema.file({
          id: 'pdf',
          label: 'PDF',
          help: 'PDF version of the post.',
          exts: ['.pdf'],
        }),
        schema.datetime({
          id: 'publishedAtOverride',
          label: 'Published Date Override',
          help: 'Override for the "Published" date.'
        }),
        schema.reference({
          id: 'parentPost',
          label: 'Parent Post',
          help: 'Optional parent post for breadcrumbs.',
          collections: ['BlogPosts'],
        }),
        schema.array({
          id: 'relatedPosts',
          label: 'Related Posts',
          help: 'Suggest related blog posts to read.',
          of: schema.reference({collections: ['BlogPosts', 'BlogPostsSandbox']}),
        }),
      ],
    }),
  ],
});
