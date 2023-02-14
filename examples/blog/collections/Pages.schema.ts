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
  fields: [
    schema.string({
      id: 'internalDesc',
      label: 'Internal Description',
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
          translate: true,
          variant: 'textarea',
        }),
      ],
    }),

    schema.array({
      id: 'modules',
      label: 'Modules',
      of: schema.oneOf({
        types: templates,
      }),
      preview: (value: any) => {
        return value.internalDesc || value.id || '';
      },
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
