import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'TemplateHero',
  description: 'Basic hero.',
  fields: [
    schema.string({
      id: 'internalDesc',
      label: 'Internal Description',
    }),
    schema.string({
      id: 'title',
      label: 'Title',
      translate: true,
    }),
    schema.image({
      id: 'image',
      label: 'Image',
    }),
  ],
});
