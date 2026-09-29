import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'TemplateGuides',
  label: 'Guides',
  description:
    'Section header followed by a card for every doc in the Guides collection.',
  preview: {
    title: ['m{_index:02}: Guides: {title}', 'm{_index:02}: Guides'],
  },
  fields: [
    schema.string({
      id: 'id',
      label: 'ID',
      help: 'Used for deep linking, tracking, etc.',
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
    schema.richtext({
      id: 'body',
      label: 'Body copy',
      translate: true,
    }),
    schema.richtext({
      id: 'docsLink',
      label: 'Docs link',
      help: 'Line below the header that points developers to the docs.',
      translate: true,
    }),
  ],
});
