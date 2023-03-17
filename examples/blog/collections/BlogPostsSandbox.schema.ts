import {schema} from '@blinkk/root-cms';
import blogPostsSchema from './BlogPosts.schema.js';

export default schema.collection({
  ...blogPostsSchema,
  name: 'BlogPosts [SANDBOX]',
  description: 'Playground for blog posts.',
  url: '/blog-sandbox/[slug]',
});
