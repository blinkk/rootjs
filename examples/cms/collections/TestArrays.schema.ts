import {schema} from '@blinkk/root-cms';

export default schema.collection({
  name: 'TestArrays',
  description: 'Test collection for array field drag and drop functionality.',
  url: '/test/[...slug]',
  preview: {
    title: 'title',
  },

  fields: [
    schema.string({
      id: 'title',
      label: 'Title',
      help: 'Page title.',
    }),

    schema.array({
      id: 'simpleItems',
      label: 'Simple Items',
      help: 'Test array with simple string items.',
      of: schema.string({
        id: 'text',
        label: 'Text',
        help: 'Simple text field.',
      }),
      preview: '{text}',
    }),

    schema.array({
      id: 'complexItems',
      label: 'Complex Items', 
      help: 'Test array with complex object items.',
      of: schema.object({
        id: 'item',
        label: 'Item',
        fields: [
          schema.string({
            id: 'name',
            label: 'Name',
            help: 'Item name.',
          }),
          schema.string({
            id: 'description',
            label: 'Description',
            help: 'Item description.',
            variant: 'textarea',
          }),
          schema.image({
            id: 'image',
            label: 'Image',
            help: 'Item image.',
          }),
        ],
      }),
      preview: ['{name}', '{name} - {description}', 'Item {_index1}'],
    }),

    schema.array({
      id: 'nestedArrays',
      label: 'Nested Arrays',
      help: 'Test array with nested arrays.',
      of: schema.object({
        id: 'section',
        label: 'Section',
        fields: [
          schema.string({
            id: 'title',
            label: 'Section Title',
          }),
          schema.array({
            id: 'items',
            label: 'Section Items',
            of: schema.string({
              id: 'text',
              label: 'Text',
            }),
            preview: '{text}',
          }),
        ],
      }),
      preview: '{title}',
    }),
  ],
});