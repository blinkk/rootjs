import {createRoute} from '@blinkk/root-cms';
import {CMS_ROUTE_OPTIONS} from '@/utils/cms-client.js';
import Page from '../[...blog].js';

const BlogSandboxPage = Page;
export default BlogSandboxPage;

export const {handle} = createRoute({
  ...CMS_ROUTE_OPTIONS,
  collection: 'BlogSandbox',
  slugParam: 'slug',
  previewOnly: true,
});
