import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'TemplateSandbox',
  preview: {
    title: ['m{_index:02}: {title}'],
  },
  fields: [
    schema.image({
      id: 'image',
      label: 'ImageField',
    }),
    schema.file({
      id: 'file',
      label: 'FileField',
    }),
    schema.file({
      id: 'fileTxtOnly',
      label: 'FileField (.txt only)',
      exts: ['.txt'],
    }),
    schema.references({
      id: 'references',
      label: 'ReferencesField',
    }),
    schema.datetime({
      id: 'datetime',
      label: 'DateTimeField',
    }),
    schema.datetime({
      id: 'datetimeWithTimezone',
      label: 'DateTimeField',
      timezone: 'Asia/Tokyo',
    }),
    schema.date({
      id: 'date',
      label: 'DateField',
    }),
    schema.password({
      id: 'password',
      label: 'PasswordField',
      help: 'Stored as a salted hash; verify with cmsClient.verifyPassword().',
      minLength: 4,
    }),
    schema.string({
      id: 'string',
      label: 'StringField (Textarea)',
      autosize: true,
      variant: 'textarea',
      translate: true,
    }),
    schema.string({
      id: 'jsonString',
      label: 'StringField (JSON)',
      autosize: true,
      variant: 'json',
      translate: true,
    }),
    schema.richtext({
      id: 'richtext',
      label: 'RichTextField',
      autosize: true,
      translate: true,
      paragraphSizes: [
        {
          value: 'small',
          label: 'Small',
          editorStyle: {fontSize: '0.875em', lineHeight: 1.45},
        },
        {
          value: 'large',
          label: 'Larger',
          editorStyle: {fontSize: '1.25em', lineHeight: 1.3, fontWeight: 500},
        },
      ],
      blockComponents: [
        schema.define({
          name: 'PeopleListBlock',
          label: 'People List Block',
          fields: [
            schema.array({
              id: 'people',
              label: 'People',
              of: schema.object({
                fields: [
                  schema.object({
                    id: 'person',
                    label: 'Person',
                    fields: [
                      schema.string({
                        id: 'name',
                        label: 'Name',
                      }),
                      schema.image({
                        id: 'photo',
                        label: 'Photo',
                      }),
                    ],
                  }),
                ],
              }),
            }),
          ],
        }),
      ],
    }),
    schema.object({
      id: 'conditional',
      label: 'Conditional fields (showWhen)',
      variant: 'inline',
      fields: [
        schema.boolean({
          id: 'showCta',
          label: 'Show CTA',
          checkboxLabel: 'Show CTA',
        }),
        schema.string({
          id: 'ctaLabel',
          label: 'CTA label',
          help: 'Only shown when "Show CTA" is checked.',
          showWhen: {field: 'showCta'},
        }),
        schema.oneOf({
          id: 'media',
          label: 'Media',
          types: [
            schema.define({
              name: 'SandboxImage',
              fields: [schema.image({id: 'image', label: 'Image'})],
            }),
            schema.define({
              name: 'SandboxVideo',
              fields: [schema.string({id: 'youtubeId', label: 'YouTube ID'})],
            }),
          ],
        }),
        schema.boolean({
          id: 'autoplay',
          label: 'Autoplay',
          checkboxLabel: 'Autoplay video',
          help: 'Only shown when the media type is "SandboxVideo".',
          showWhen: {field: 'media._type', equals: 'SandboxVideo'},
        }),
      ],
    }),
    schema.array({
      id: 'modules',
      label: 'Modules',
      of: schema.oneOf({
        types: schema.glob('/templates/*/*.schema.ts'),
      }),
    }),
  ],
});
