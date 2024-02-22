import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'TemplateHero',
  description: 'Basic hero.',
  fields: [
    schema.string({
      id: 'id',
      label: 'ID',
      help: 'Used for deep linking, tracking, etc.'
    }),
    schema.multiselect({
      id: 'options',
      label: 'Module Options',
      help: 'Layout and display options.',
      options: ['text:center', 'size:h2'],
      creatable: true,
    }),
    schema.string({
      id: 'title',
      label: 'Title',
      translate: true,
      default: 'Hello world',
    }),
    schema.image({
      id: 'image',
      label: 'Image',
    }),
  ],
});
