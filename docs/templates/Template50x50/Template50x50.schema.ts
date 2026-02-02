import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'Template50x50',
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
      options: [
        {value: 'layout:align-center'},
        {value: 'layout:mobile-reverse'},
        {value: 'CopyBlock:mobile-text-center'},
      ],
      creatable: true,
    }),
    schema.oneOf({
      id: 'leftSection',
      label: 'Left Section',
      types: schema.allSchemas('/blocks/*/*.schema.ts', {omitFields: ['id']}),
    }),
    schema.oneOf({
      id: 'rightSection',
      label: 'Right Section',
      types: schema.allSchemas('/blocks/*/*.schema.ts', {omitFields: ['id']}),
    }),
  ],
});
