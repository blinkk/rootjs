import {schema} from '@blinkk/root-cms';
import Page from '@/routes/[...slug].js';

const templateModules = import.meta.glob('@/templates/**/*.schema.ts', {eager: true});
const templates = Object.values(templateModules).map((module: any) => module.default);

export default schema.collection({
  name: 'Page',
  description: 'Website pages.',
  url: '/[...slug]',
  Component: Page,
  fields: [
    schema.string({
      id: 'internalDesc',
      label: 'Internal Description',
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
          translate: true,
        }),
      ],
    }),

    schema.array({
      id: 'modules',
      of: schema.oneOf({
        types: templates,
      }),
    }),

    schema.object({
      id: 'advanced',
      label: 'Advanced',
      fields: [
        schema.string({
          id: 'analtyics',
          label: 'Analytics',
          help: 'HTML injected into the page for custom analytics.'
        }),
      ],
    }),
  ],
});
