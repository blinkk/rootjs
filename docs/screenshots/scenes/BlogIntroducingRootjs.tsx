import type {SceneMeta} from '../types.js';
import {BlogMetaImage} from '../ui/blog.js';

export const meta: SceneMeta = {
  id: 'blog-introducing-rootjs',
  width: 1200,
  height: 630,
  alt: 'Introducing Root.js — A fast, modern web platform that comes with a CMS.',
};

/** Meta image scene for `BlogPosts/introducing-rootjs`. */
export default function BlogIntroducingRootjs() {
  return (
    <BlogMetaImage
      date="April 1, 2024"
      title="Introducing Root.js"
      description="A fast, modern web platform that comes with a CMS."
      badge="Build. Edit. Ship."
      pills={[
        'Zero-JS SSR',
        'Web Component Islands',
        'Built-in i18n',
        'First-Party CMS',
      ]}
    />
  );
}
