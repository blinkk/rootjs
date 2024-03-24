import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'TemplateImage',
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
    }),
    schema.image({
      id: 'image',
      label: 'Image',
    }),
  ],
});
