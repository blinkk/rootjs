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
  ],
});
