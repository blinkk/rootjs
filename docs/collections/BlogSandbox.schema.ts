import {schema} from '@blinkk/root-cms';
import BlogPostsSchema from './BlogPosts.schema.js';

export default schema.collection({
  name: 'BlogSandbox',
  description: 'Blog Sandbox (Preview Only)',
  url: '/blog/sandbox/[slug]',
  group: 'Sandbox',
  preview: {
    title: 'meta.title',
    image: 'meta.image',
    defaultImage: {
      src: 'https://lh3.googleusercontent.com/c2ECbvhJtxf3xbPIjaXCSpmvAsJkkhzJwG98T9RPvWy4s30jZKClom8pvWTnupRYOnyI3qGhNXPOwqoN6sqljkDO62LIKRtR988',
    },
  },
  autolock: false,
  fields: BlogPostsSchema.fields,
});
