import {schema} from '@blinkk/root-cms';
import Page from '@/routes/[...slug].js';

const templateModules = import.meta.glob('@/templates/*/*.schema.ts', {
  eager: true,
});
const templates = Object.values(templateModules).map(
  (module: {default: schema.Schema}) => module.default
);

export default schema.collection({
  name: 'Pages',
  description: 'A collection of landing pages for the website.',
  url: '/[...slug]',
  Component: Page,
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
            types: templates,
          }),
          preview: [
            'm{_index:02}: {_type} ({id})',
            'm{_index:02}: {_type} (no tracking id)',
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
