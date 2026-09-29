import {cmsRoute} from '@/utils/cms-route.js';
import {fetchGuidesForModules} from '@/utils/guides.js';
import Page from '../[[...page]].js';

const SandboxPage = Page;
export default SandboxPage;

export const {handle} = cmsRoute({
  collection: 'Sandbox',
  slugParam: 'page',
  previewOnly: true,
  preRenderHook: fetchGuidesForModules,
});
