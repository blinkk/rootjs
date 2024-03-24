import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'TemplateJumplinks',
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
    schema.string({
      id: 'title',
      label: 'Title',
      help: 'Optional headline title.',
      variant: 'textarea',
      translate: true,
    }),
    schema.array({
      id: 'links',
      label: 'Links',
      preview: ['{label} ({href})', '{label}', '(empty)'],
      of: schema.object({
        fields: [
          schema.string({
            id: 'label',
            variant: 'textarea',
            translate: true,
          }),
          schema.string({
            id: 'ariaLabel',
            variant: 'textarea',
            translate: true,
          }),
          schema.string({
            id: 'href',
            variant: 'textarea',
          }),
        ],
      }),
    }),
  ],
});
