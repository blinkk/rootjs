import {cmsRoute} from '@/utils/cms-route.js';
import Page from '../[[...page]].js';

const SandboxPage = Page;
export default SandboxPage;

export const {handle} = cmsRoute({
  collection: 'Pages',
  slugParam: 'page',
  previewOnly: true,
});
