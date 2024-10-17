import {cmsRoute} from '@blinkk/root-cms';
import {default as Page} from './blog/[...blog].js';

// TODO(stevenle): Create a blog listing page when we have more than 1 post.
export default Page;

export const {handle} = cmsRoute({
  collection: 'BlogPosts',
  slug: 'introducing-rootjs',
});
