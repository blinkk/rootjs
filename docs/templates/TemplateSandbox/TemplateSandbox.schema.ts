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
    schema.string({
      id: 'string',
      label: 'StringField',
      autosize: true,
      variant: 'textarea',
    }),
    schema.richtext({
      id: 'richtext',
      label: 'RichTextField',
      autosize: true,
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
  ],
});
