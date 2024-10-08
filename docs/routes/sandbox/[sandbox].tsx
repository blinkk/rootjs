import {cmsRoute} from '@/utils/cms-route.js';
import Page from '../[[...page]].js';

export default Page;

export const {handle} = cmsRoute({
  collection: 'PagesSandbox',
  slugParam: 'sandbox',
});
