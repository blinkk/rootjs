import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'TemplateBlogPosts',
  label: 'Blog Posts',
  description:
    'Section header followed by a list of every doc in the BlogPosts collection, newest first.',
  preview: {
    title: ['m{_index:02}: Blog Posts: {title}', 'm{_index:02}: Blog Posts'],
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
  ],
});
