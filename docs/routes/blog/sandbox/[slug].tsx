import {cmsRoute} from '@/utils/cms-route.js';
import Page from '../[...blog].js';

const BlogSandboxPage = Page;
export default BlogSandboxPage;

export const {handle} = cmsRoute({
  collection: 'BlogSandbox',
  slugParam: 'slug',
  previewOnly: true,
});
