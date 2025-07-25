import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'CodeBlock',
  preview: 'Code: {language || "text"}',
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
    schema.select({
      id: 'language',
      label: 'Language',
      options: [
        {value: 'bash'},
        {value: 'html'},
        {value: 'json'},
        {value: 'ts'},
        {value: 'tsx'},
      ],
    }),
    // schema.string({
    //   id: 'filename',
    //   label: 'Filename',
    //   variant: 'textarea',
    // }),
    schema.string({
      id: 'code',
      label: 'Code',
      variant: 'textarea',
    }),
  ],
});
