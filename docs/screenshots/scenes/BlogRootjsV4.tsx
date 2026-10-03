import type {SceneMeta} from '../types.js';
import {BlogMetaImage} from '../ui/blog.js';

export const meta: SceneMeta = {
  id: 'blog-rootjs-v4',
  width: 1200,
  height: 630,
  alt: 'Announcing Root.js v4.0 — A redesigned CMS, a new look, and themes to make it your own.',
};

/** Meta image scene for `BlogPosts/rootjs-v4`. */
export default function BlogRootjsV4() {
  return (
    <BlogMetaImage
      date="October 2, 2026"
      title="Announcing Root.js v4.0"
      description="A redesigned CMS, a new look, and themes to make it your own."
      badge="@blinkk/root v4.0"
      pills={[
        'CMS Redesign',
        'New 8-bit Logo',
        'CMS Themes',
        'Better Defaults',
      ]}
    />
  );
}
