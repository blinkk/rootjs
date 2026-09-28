import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'TemplateCodeShowcase',
  label: 'Code Showcase',
  description: 'Section header followed by one or more annotated code files.',
  preview: {
    title: [
      'm{_index:02}: Code Showcase: {title}',
      'm{_index:02}: Code Showcase',
    ],
  },
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
        {value: 'theme:dark'},
        {value: 'theme:tint'},
        {value: 'spacing:compact'},
      ],
      creatable: true,
    }),
    schema.string({
      id: 'eyebrow',
      label: 'Eyebrow',
      translate: true,
    }),
    schema.string({
      id: 'title',
      label: 'Title',
      translate: true,
      variant: 'textarea',
    }),
    schema.string({
      id: 'body',
      label: 'Body copy',
      translate: true,
      variant: 'textarea',
    }),
    schema.array({
      id: 'files',
      label: 'Files',
      help: 'Shown side by side on desktop (up to 3).',
      preview: ['{filename}'],
      of: schema.object({
        fields: [
          schema.string({
            id: 'filename',
            label: 'Filename',
            help: 'e.g. "collections/Pages.schema.ts".',
          }),
          schema.string({
            id: 'caption',
            label: 'Caption',
            help: 'Optional. Short note shown above the code.',
            translate: true,
          }),
          schema.select({
            id: 'language',
            label: 'Language',
            options: [
              {value: 'bash'},
              {value: 'json'},
              {value: 'ts'},
              {value: 'tsx'},
            ],
          }),
          schema.string({
            id: 'code',
            label: 'Code',
            variant: 'textarea',
          }),
        ],
      }),
    }),
  ],
});
