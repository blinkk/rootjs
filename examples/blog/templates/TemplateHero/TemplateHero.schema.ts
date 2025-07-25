import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'TemplateHero',
  metadata: {
    title: 'Hero Section',
    description: 'A prominent hero section with customizable content and image',
    image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&h=200&fit=crop&auto=format&q=80'
  },
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
