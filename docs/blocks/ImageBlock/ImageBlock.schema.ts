import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'ImageBlock',
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
    schema.image({
      id: 'image',
      label: 'Image',
    }),
  ],
});
