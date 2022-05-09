import {defineProject} from '@blinkk/root-core';

export default defineProject({
  id: 'example-nextjs-blog',
  gcpProjectId: 'rootjs-cms',
  name: 'Next.js Blog',
  domains: [
    'example-nextjs-blog.blinkkcms.com',
  ],
});
