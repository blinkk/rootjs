import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'Section',
  description: '',
  fields: [
    schema.string({
      id: 'id',
      label: 'ID',
      help: 'Used for deep linking, tracking, etc.',
    }),
    schema.string({
      id: 'description',
      label: 'Description',
      help: 'Required. Accessibility description for screen readers.',
      variant: 'textarea',
    }),
    schema.multiselect({
      id: 'options',
      label: 'Module Options',
      help: 'Layout and display options.',
      options: [],
      creatable: true,
    }),
    schema.array({
      id: 'modules',
      label: 'Modules',
      of: schema.oneOf({
        types: schema.glob('/templates/*/*.schema.ts', {
          exclude: ['Section'],
        }),
      }),
      preview: ['{_type} (#{id})', '{_type}', '(empty)'],
    }),
  ],
});
