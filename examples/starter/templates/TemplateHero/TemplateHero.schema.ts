import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'TemplateHero',
  description: 'Large page heading with an optional image.',
  fields: [
    schema.string({
      id: 'title',
      label: 'Title',
      translate: true,
    }),
    schema.string({
      id: 'body',
      label: 'Body',
      translate: true,
      variant: 'textarea',
    }),
    schema.image({
      id: 'image',
      label: 'Image',
    }),
  ],
});
