import {schema} from '@blinkk/root-cms';

const templateModules = import.meta.glob('/templates/*/*.schema.ts', {
  eager: true,
});
const templates = Object.values(templateModules).map(
  (module: {default: schema.Schema}) => module.default
);

export default schema.collection({
  name: 'Pages',
  description: 'Landing Pages',
  url: '/[...slug]',
  preview: {
    title: 'meta.title',
    image: 'meta.image',
    defaultImage: {
      src: 'https://lh3.googleusercontent.com/c2ECbvhJtxf3xbPIjaXCSpmvAsJkkhzJwG98T9RPvWy4s30jZKClom8pvWTnupRYOnyI3qGhNXPOwqoN6sqljkDO62LIKRtR988',
    },
  },
  autolock: true,
  sortOptions: [
    {id: 'title', label: 'Title A-Z', field: 'fields.meta.title'},
  ],

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
        schema.array({
          id: 'modules',
          label: 'Modules',
          help: 'Compose the page by adding one or more modules.',
          of: schema.oneOf({
            types: templates,
          }),
          preview: [
            'm{_index:02}: {description} (#{id})',
            'm{_index:02}: {title} (#{id})',
            'm{_index:02}: {description}',
            'm{_index:02}: {title}',
            'm{_index:02}: #{id}',
            'm{_index:02}: {_type}',
            'm{_index:02}',
          ],
        }),
      ],
    }),
  ],
});
