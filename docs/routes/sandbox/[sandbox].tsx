import {cmsRoute} from '@blinkk/root-cms';
import Page from '../[[...page]].js';

export default Page;

export const {handle} = cmsRoute({
  collection: 'PagesSandbox',
  slugParam: 'sandbox',
});
