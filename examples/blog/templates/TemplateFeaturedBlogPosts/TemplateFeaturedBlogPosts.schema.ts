import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'TemplateFeaturedBlogPosts',
  description: 'Featured blog posts.',
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
      options: [],
      creatable: true,
    }),
    schema.string({
      id: 'morePostsTitle',
      label: 'More Posts: Title',
      help: 'Headline below the featured blog post.',
      translate: true,
    }),
  ],
});
