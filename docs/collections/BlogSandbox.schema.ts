import {schema} from '@blinkk/root-cms';
import BlogPostsSchema from './BlogPosts.schema.js';

export default schema.collection({
  name: 'BlogSandbox',
  description: 'Blog Sandbox (Preview Only)',
  url: '/blog/sandbox/[slug]',
  group: 'Sandbox',
  autoSlug: '{date:YYYYMMDD}-{adjective}-{noun}',
  preview: {
    title: 'meta.title',
    image: 'meta.image',
    defaultImage: {
      src: 'https://lh3.googleusercontent.com/sdCQ6SQzxbiw0CSR4pG3TGaXZNbsFdEKrj8GfZRQlB98zUW68D0qJyUZzwDCh3il5LBIH-pGoK0aMSySR4v-SpyX11sPLehvSw',
    },
  },
  autolock: false,
  fields: BlogPostsSchema.fields,
});
