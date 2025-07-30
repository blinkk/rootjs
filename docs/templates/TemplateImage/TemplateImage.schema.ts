import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'TemplateImage',
  preview: {
    image: '{image.src}',
  },
  fields: [
    schema.string({
      id: 'id',
      label: 'ID',
      help: 'Used for deep linking, tracking, etc.',
    }),
    schema.multiselect({
      id: 'options',
      label: 'Module Options',
      help: 'Layout and display options.',
      creatable: true,
      options: [{value: 'max-w-1000'}],
    }),
    schema.image({
      id: 'image',
      label: 'Image',
    }),
  ],
});
