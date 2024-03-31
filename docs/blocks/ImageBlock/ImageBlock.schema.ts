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
      options: [{value: 'bordered'}, {value: 'open-in-new-tab'}],
      creatable: true,
    }),
    schema.image({
      id: 'image',
      label: 'Image',
    }),
    schema.string({
      id: 'caption',
      label: 'Caption',
      help: 'Optional caption that displays below the image.',
      translate: true,
    }),
  ],
});
