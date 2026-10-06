import {createRoute} from '@blinkk/root-cms';
import {CMS_ROUTE_OPTIONS} from '@/utils/cms-client.js';
import {addModuleData, addModuleDataQueries} from '@/utils/module-data.js';
import Page from '../[[...page]].js';

const SandboxPage = Page;
export default SandboxPage;

export const {handle} = createRoute({
  ...CMS_ROUTE_OPTIONS,
  collection: 'Sandbox',
  slugParam: 'page',
  previewOnly: true,
  batchRequest: addModuleDataQueries,
  preRenderHook: addModuleData,
});
