import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'TemplatePoweredBy',
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
      options: [{value: 'title:h1'}],
      creatable: true,
    }),
    schema.string({
      id: 'title',
      label: 'Title',
      translate: true,
      variant: 'textarea',
    }),
    schema.array({
      id: 'logos',
      label: 'Logos',
      preview: ['{name}'],
      of: schema.object({
        fields: [
          schema.image({
            id: 'logo',
            label: 'Logo image',
          }),
          schema.string({
            id: 'name',
            label: 'Name',
          }),
        ],
      }),
    }),
    schema.richtext({
      id: 'body',
      label: 'Body copy',
      translate: true,
    }),
  ],
});
