import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'CopyBlock',
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
      id: 'eyebrow',
      label: 'Eyebrow',
      help: 'Small text above the title.',
      translate: true,
      variant: 'textarea',
    }),
    schema.string({
      id: 'title',
      label: 'Title',
      help: 'Main headline title.',
      translate: true,
      variant: 'textarea',
    }),
    schema.select({
      id: 'titleSize',
      label: 'Title Size',
      options: [
        {value: 'h1'},
        {value: 'h2'},
        {value: 'h3'},
        {value: 'h4'},
        {value: 'h5'},
        {value: 'h6'},
      ],
    }),
    schema.richtext({
      id: 'body',
      label: 'Body copy',
      help: 'Headline body copy.',
      translate: true,
    }),
  ],
});
