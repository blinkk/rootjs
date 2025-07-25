import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'ImageBlock',
  preview: 'ImageBlock: {id}',
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
        {value: 'bordered'},
        {value: 'max-w-1000'},
        {value: 'open-in-new-tab'},
      ],
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
    schema.object({
      id: 'advanced',
      label: 'Advanced',
      help: 'These fields are optional.',
      fields: [
        schema.string({
          id: 'maxWidth',
          label: 'Max Width',
          help: 'e.g. 300px',
        }),
        schema.boolean({
          id: 'bordered',
          label: 'Bordered?',
        }),
      ],
      variant: 'drawer',
      drawerOptions: {collapsed: true, inline: true},
    }),
  ],
});
